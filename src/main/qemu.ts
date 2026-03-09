import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as os from 'os'
import { app } from 'electron'
// @ts-ignore - node-pty has no typings
import * as pty from 'node-pty'
import { SshTunnel } from './ssh-tunnel'
export interface VMConfig {
  memory: number // MB
  cpus: number
  diskSize: number // GB
  diskPath?: string
  autoLoginDelay?: number
  sshPort?: number
}

export interface ImageStatus {
  exists: boolean
  path: string
  size?: number
  isDefault: boolean
}

export class QemuManager {
  private ptyProcess: ReturnType<typeof pty.spawn> | null = null
  private webContents: Electron.WebContents | null = null
  private autoLoginTimer: ReturnType<typeof setTimeout> | null = null
  private outputBuffer = ''
  private loggedIn = false
  private lastLoginSend = 0
  private lastPasswordSend = 0
  private readonly LOGIN_PROMPTS = ['login:', 'Login:', 'localhost login:']
  private readonly PASSWORD_PROMPTS = ['Password:', 'password:', 'Password: ', 'password: ']
  private readonly SHELL_PROMPTS = ['# ', '$ ', '~# ', '~$ ', 'root@', 'ubuntu@']
  private readonly CONTINUE_PROMPTS = ['Continue?', 'continue?', 'Y/n', 'y/n']
  private lastContinueSend = 0
  private sttySent = false
  private sshTunnel: SshTunnel | null = null
  private sshTunnelConfig: { sshPort: number } | null = null
  private openclawTokenSent = false

  setWebContents(wc: Electron.WebContents | null) {
    this.webContents = wc
  }

  /** 安全发送 IPC，窗口销毁时不抛错 */
  private safeSend(channel: string, ...args: unknown[]): void {
    try {
      if (this.webContents && !this.webContents.isDestroyed()) {
        this.webContents.send(channel, ...args)
      }
    } catch {
      // 忽略 Object has been destroyed 等错误
    }
  }

  getHostInfo(): { totalMemMB: number; cpuCount: number } {
    const totalMemMB = Math.floor(os.totalmem() / (1024 * 1024))
    const cpuCount = os.cpus().length
    return { totalMemMB, cpuCount }
  }

  getDefaultConfig(): VMConfig {
    const { totalMemMB, cpuCount } = this.getHostInfo()
    // 分配宿主机约 1/2 内存给 VM，上限 8GB，下限 1024MB，步长 256MB
    const mem = Math.min(8192, Math.max(1024, Math.floor(totalMemMB / 2 / 256) * 256))
    // 分配宿主机约 1/2 CPU 给 VM，下限 2，上限 8
    const cpus = Math.min(8, Math.max(2, Math.floor(cpuCount / 2)))
    return {
      memory: mem,
      cpus,
      diskSize: 8,
      autoLoginDelay: 12,
      sshPort: 2222,
    }
  }

  getDataDir(): string {
    const userData = app.getPath('userData')
    const vmDir = path.join(userData, 'vm-data')
    if (!fs.existsSync(vmDir)) {
      fs.mkdirSync(vmDir, { recursive: true })
    }
    return vmDir
  }

  private readonly IMAGE_NAME = 'ubuntu-24.04-minimal-cloudimg-amd64-compressed.img'

  /** 获取内置 qcow2 磁盘镜像源路径（打包后或开发时） */
  getBundledDiskPath(): string | null {
    if (process.resourcesPath && !process.defaultApp) {
      const packaged = path.join(process.resourcesPath, this.IMAGE_NAME)
      if (fs.existsSync(packaged)) {
        console.log('[QemuManager] 找到打包镜像:', packaged)
        return packaged
      }
    }
    const devPath = path.join(app.getAppPath(), 'resources', this.IMAGE_NAME)
    if (fs.existsSync(devPath)) {
      console.log('[QemuManager] 找到开发镜像:', devPath)
      return devPath
    }
    console.log('[QemuManager] 未找到内置镜像')
    return null
  }

  /** 获取可写的磁盘路径：优先使用 userData 中的副本，不存在则从内置镜像复制 */
  getDiskPathForVm(): string | null {
    const vmDir = this.getDataDir()
    const userDiskPath = path.join(vmDir, this.IMAGE_NAME)
    if (fs.existsSync(userDiskPath)) {
      return userDiskPath
    }
    const bundled = this.getBundledDiskPath()
    if (!bundled) return null
    try {
      console.log('[QemuManager] 复制镜像到 userData:', userDiskPath)
      fs.copyFileSync(bundled, userDiskPath)
      return userDiskPath
    } catch (e) {
      console.error('[QemuManager] 复制镜像失败:', e)
      return null
    }
  }

  getImageStatus(): ImageStatus {
    const diskPath = this.getBundledDiskPath()
    if (diskPath) {
      const stat = fs.statSync(diskPath)
      return {
        exists: true,
        path: diskPath,
        size: stat.size,
        isDefault: true,
      }
    }
    return {
      exists: false,
      path: '',
      isDefault: true,
    }
  }

  async ensureDefaultImage(): Promise<{
    success: boolean
    path: string
    error?: string
  }> {
    const status = this.getImageStatus()
    if (status.exists) {
      return { success: true, path: status.path }
    }
    return {
      success: false,
      path: '',
      error: '未找到内置镜像，请重新安装应用',
    }
  }

  async start(config: VMConfig): Promise<{ success: boolean; error?: string }> {
    console.log('[QemuManager] start 调用, config=', JSON.stringify(config))
    this.safeSend('qemu:progress', '正在启动虚拟机...')
    if (this.ptyProcess) {
      console.log('[QemuManager] 虚拟机已在运行')
      return { success: false, error: '虚拟机已在运行中' }
    }

    const qemuPath = this.findQemu()
    console.log('[QemuManager] QEMU 路径:', qemuPath || '(未找到)')
    if (!qemuPath) {
      return { success: false, error: '未找到 QEMU，请先安装: brew install qemu (macOS) 或从 qemu.org 安装 (Windows)' }
    }

    const diskPath = config.diskPath || this.getDiskPathForVm()
    if (!diskPath || !fs.existsSync(diskPath)) {
      return { success: false, error: `未找到内置磁盘镜像 ${this.IMAGE_NAME}，请确保 resources/${this.IMAGE_NAME} 存在` }
    }

    const vmDir = this.getDataDir()
    console.log('[QemuManager] 启动参数: diskPath=', diskPath)

    const sshPort = config.sshPort ?? 2222
    // OpenClaw 默认端口：18789=gateway/chat，18791=browser control
    const nic = `user,model=virtio-net-pci,hostfwd=tcp::${sshPort}-:22,hostfwd=tcp::18789-:18789,hostfwd=tcp::18791-:18791`
    const args: string[] = []
    if (process.platform === 'win32') {
      args.push('-accel', 'whpx,kernel-irqchip=off', '-accel', 'hax', '-accel', 'tcg,thread=multi')
      console.log('[QemuManager] Windows 加速: whpx(Hyper-V) -> hax(HAXM) -> tcg(兜底)')
    }
    args.push(
      '-m',
      String(config.memory || 512),
      '-smp',
      String(config.cpus || 2),
      '-drive',
      `file=${diskPath},format=qcow2,if=virtio`,
      '-nographic',
      '-serial',
      'mon:stdio',
      '-nic',
      nic,
    )

    try {
      const qemuExe = path.join(qemuPath, process.platform === 'win32' ? 'qemu-system-x86_64.exe' : 'qemu-system-x86_64')
      this.outputBuffer = ''
      this.loggedIn = false
      this.openclawTokenSent = false

      const spawnEnv = { ...process.env }
      if (process.platform === 'win32') {
        spawnEnv.LANG = 'en_US.UTF-8'
        spawnEnv.LC_ALL = 'en_US.UTF-8'
      }

      let spawnFile: string
      let spawnArgs: string[]
      if (process.platform === 'win32') {
        const wrapperPs1 = path.join(app.getPath('temp'), 'easyclaw-qemu-utf8.ps1')
        const ps1Content = `chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$exe = $args[0]
$rest = if ($args.Length -gt 1) { $args[1..($args.Length-1)] } else { @() }
& $exe @rest
`
        fs.writeFileSync(wrapperPs1, ps1Content, 'utf8')
        spawnFile = 'powershell.exe'
        spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapperPs1, qemuExe, ...args]
        console.log('[QemuManager] Windows UTF-8: chcp 65001 + Console.OutputEncoding 已通过 PowerShell 包装执行')
      } else {
        spawnFile = qemuExe
        spawnArgs = args
      }

      this.ptyProcess = pty.spawn(spawnFile, spawnArgs, {
        cwd: vmDir,
        cols: 80,
        rows: 24,
        encoding: process.platform === 'win32' ? undefined : 'utf8',
        env: spawnEnv,
      })

      this.sshTunnelConfig = { sshPort }

      this.ptyProcess.onData((data: string | Buffer) => {
        const str = typeof data === 'string' ? data : (data as Buffer).toString('utf8')
        this.safeSend('qemu:data', str)
        this.handleOutput(str)
      })

      this.ptyProcess.onExit(({ exitCode }) => {
        if (this.autoLoginTimer) {
          clearTimeout(this.autoLoginTimer)
          this.autoLoginTimer = null
        }
      this.ptyProcess = null
      this.openclawTokenSent = false
      this.safeSend('qemu:exit', exitCode ?? 0)
      })

      this.scheduleAutoLogin(config)
      this.safeSend('qemu:progress', '正在启动系统...')
      console.log('[QemuManager] QEMU 进程已启动 (node-pty)')
      return { success: true }
    } catch (err: unknown) {
      this.ptyProcess = null
      return {
        success: false,
        error: err instanceof Error ? err.message : '启动失败',
      }
    }
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data
    if (this.outputBuffer.length > 8192) {
      this.outputBuffer = this.outputBuffer.slice(-4096)
    }
    // 登录后解析 OpenClaw Dashboard URL 中的 token（优先匹配 "Dashboard URL:" 行）
    if (this.loggedIn && !this.openclawTokenSent) {
      const dashboardMatch = this.outputBuffer.match(/Dashboard URL:\s*https?:\/\/[^\s]+#token=([a-f0-9]+)/i)
      const fallbackMatch = this.outputBuffer.match(/#token=([a-f0-9]+)/)
      const m = dashboardMatch || fallbackMatch
      if (m) {
        this.openclawTokenSent = true
        this.safeSend('qemu:openclawToken', m[1])
      }
    }
    if (this.loggedIn) return
    for (const p of this.SHELL_PROMPTS) {
      if (this.outputBuffer.includes(p)) {
        this.loggedIn = true
        if (this.autoLoginTimer) {
          clearTimeout(this.autoLoginTimer)
          this.autoLoginTimer = null
        }
        if (!this.sttySent) {
          this.sttySent = true
          this.safeSend('qemu:requestDimensions')
          this.safeSend('qemu:progress', '正在启动 OpenClaw...')
        }
        setTimeout(() => {
          this.sendKey('openclaw dashboard\r')
          this.safeSend('qemu:progress', '等待 OpenClaw 启动...')
          console.log('[QemuManager] 登录成功，已发送 openclaw dashboard')
        }, 300)
        // 延迟 12s 启动 SSH 隧道，等待 openclaw dashboard 监听 18789
        setTimeout(() => {
          this.safeSend('qemu:progress', '正在建立隧道...')
          this.startSshTunnel()
        }, 12000)
        return
      }
    }
    const now = Date.now()
    for (const p of this.CONTINUE_PROMPTS) {
      if (this.outputBuffer.includes(p) && now - this.lastContinueSend > 3000) {
        this.lastContinueSend = now
        setTimeout(() => {
          this.sendKey('y\r')
          console.log('[QemuManager] 检测到 Continue 提示，已发送 y')
        }, 100)
        return
      }
    }
    for (const p of this.PASSWORD_PROMPTS) {
      if (this.outputBuffer.includes(p) && now - this.lastPasswordSend > 2000) {
        this.lastPasswordSend = now
        setTimeout(() => {
          this.sendKey('123456\r')
          this.sendKey('\n')
          console.log('[QemuManager] 检测到密码提示，已发送密码')
        }, 150)
        return
      }
    }
    if (now - this.lastLoginSend < 2000) return
    for (const p of this.LOGIN_PROMPTS) {
      if (this.outputBuffer.includes(p)) {
        this.lastLoginSend = now
        this.safeSend('qemu:progress', '正在登录...')
        this.sendKey('ubuntu\r')
        this.sendKey('\n')
        console.log('[QemuManager] 检测到登录提示，已发送 ubuntu')
        return
      }
    }
  }

  private scheduleAutoLogin(config: VMConfig): void {
    const delay = config.autoLoginDelay ?? 12
    if (delay <= 0) return
    this.autoLoginTimer = setTimeout(() => {
      this.autoLoginTimer = null
      if (this.loggedIn) return
      this.sendKey('ubuntu\r\n')
      console.log('[QemuManager] 定时发送 ubuntu 自动登录')
      this.scheduleAutoLogin(config)
    }, delay * 1000)
  }

  sendKey(key: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(key)
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.ptyProcess || cols < 40 || rows < 10) return
    try {
      this.ptyProcess.resize(cols, rows)
    } catch {
      // ignore
    }
  }

  /** 在虚拟机内执行 stty 以修正 TUI 显示尺寸（登录后调用） */
  setGuestTerminalSize(cols: number, rows: number): void {
    if (!this.ptyProcess || cols < 40 || rows < 10) return
    this.resize(cols, rows)
    this.sendKey(`stty rows ${rows} cols ${cols}\r`)
    console.log('[QemuManager] 已同步终端尺寸:', cols, 'x', rows)
  }

  private startSshTunnel(): void {
    const cfg = this.sshTunnelConfig
    if (!cfg) return
    if (this.sshTunnel?.isRunning()) return
    this.sshTunnel = new SshTunnel({
      sshPort: cfg.sshPort,
      localPort: 18790,
      dstHost: '127.0.0.1',
      dstPort: 18789,
      username: 'ubuntu',
      password: '123456',
      onReady: () => this.probeOpenClawReady(),
      onError: () => {},
    })
    this.sshTunnel.start().catch((err) => {
      console.warn('[QemuManager] SSH 隧道启动失败，可手动执行:', err?.message)
      this.safeSend('qemu:progress', '隧道建立失败')
    })
  }

  /** 轮询探测 OpenClaw 是否就绪（HTTP 200），就绪后再发送 tunnelReady */
  private probeOpenClawReady(): void {
    const maxAttempts = 30
    let attempts = 0

    const tryProbe = () => {
      if (!this.ptyProcess) return
      attempts++
      this.safeSend('qemu:progress', `等待 OpenClaw 就绪... (${attempts}/${maxAttempts})`)

      const req = http.get(
        'http://127.0.0.1:18790/',
        { timeout: 5000 },
        (res) => {
          res.resume()
          req.destroy()
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            console.log('[QemuManager] OpenClaw 就绪, statusCode=', res.statusCode)
            this.safeSend('qemu:progress', '准备就绪')
            this.safeSend('qemu:tunnelReady')
          } else {
            console.log('[QemuManager] OpenClaw 返回非成功状态:', res.statusCode)
            if (attempts < maxAttempts) {
              setTimeout(tryProbe, 3000)
            } else {
              console.warn('[QemuManager] OpenClaw 探测超时，仍尝试加载')
              this.safeSend('qemu:progress', '准备就绪')
              this.safeSend('qemu:tunnelReady')
            }
          }
        }
      )
      req.on('error', () => {
        if (attempts < maxAttempts && this.ptyProcess) {
          setTimeout(tryProbe, 3000)
        } else {
          console.warn('[QemuManager] OpenClaw 探测超时或进程已停止')
          if (this.ptyProcess) {
            this.safeSend('qemu:progress', '准备就绪')
            this.safeSend('qemu:tunnelReady')
          }
        }
      })
      req.on('timeout', () => req.destroy())
    }

    tryProbe()
  }

  async stop(poweroff = true): Promise<boolean> {
    this.webContents = null
    if (this.sshTunnel) {
      this.sshTunnel.stop()
      this.sshTunnel = null
    }
    this.sshTunnelConfig = null
    if (!this.ptyProcess) return false
    if (poweroff) {
      this.sendKey('sudo poweroff\n')
      await new Promise((r) => setTimeout(r, 3000))
      if (this.ptyProcess) {
        this.ptyProcess.kill()
      }
    } else {
      this.ptyProcess.kill()
    }
    this.ptyProcess = null
    return true
  }

  getStatus(): { running: boolean } {
    return { running: this.ptyProcess !== null }
  }

  private findQemu(): string | null {
    if (process.platform === 'darwin') {
      const homeBrew = '/opt/homebrew/bin/'
      const paths = ['/opt/homebrew/bin/', '/usr/local/bin/']
      for (const p of paths) {
        const qemu = path.join(p, 'qemu-system-x86_64')
        if (fs.existsSync(qemu)) return p
      }
    }

    if (process.platform === 'win32') {
      const envPath = process.env.PATH || ''
      const dirs = envPath.split(path.delimiter)
      for (const d of dirs) {
        const qemu = path.join(d, 'qemu-system-x86_64.exe')
        if (fs.existsSync(qemu)) return d + path.sep
      }
    }

    // 尝试直接调用
    try {
      const { execSync } = require('child_process')
      execSync('qemu-system-x86_64 --version', { stdio: 'pipe' })
      return ''
    } catch {
      return null
    }
  }
}
