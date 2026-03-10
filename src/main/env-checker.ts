/**
 * 启动前环境审查：检查并自动修复运行依赖
 * 支持 macOS / Windows，考虑不同机器配置
 */
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as net from 'net'
import { app } from 'electron'
import { spawn } from 'child_process'

export interface EnvCheckItem {
  id: string
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  fixable: boolean
  fixHint?: string
}

export interface EnvCheckResult {
  ok: boolean
  checks: EnvCheckItem[]
  platform: string
  arch: string
}

const IMAGE_NAME = 'ubuntu-24.04-minimal-cloudimg-amd64-compressed.img'
const MIN_MEM_MB = 2048
const PORTS = [2222, 18790, 18789, 18791]

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => {
      resolve(true)
    })
    s.once('listening', () => {
      s.close()
      resolve(false)
    })
    s.listen(port, '127.0.0.1')
  })
}

function getBundledDiskPath(): string | null {
  if (process.resourcesPath && !process.defaultApp) {
    const p = path.join(process.resourcesPath, IMAGE_NAME)
    if (fs.existsSync(p)) return p
  }
  const dev = path.join(app.getAppPath(), 'resources', IMAGE_NAME)
  return fs.existsSync(dev) ? dev : null
}

function getBundledQemuDir(): string | null {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platform =
    process.platform === 'darwin'
      ? `darwin-${arch}`
      : process.platform === 'win32'
        ? 'win32-x64'
        : null
  if (!platform) return null

  let base: string
  if (process.resourcesPath && !process.defaultApp) {
    base = path.join(process.resourcesPath, 'qemu', platform)
  } else {
    base = path.join(app.getAppPath(), 'resources', 'qemu', platform)
  }
  const exeName = process.platform === 'win32' ? 'qemu-system-x86_64.exe' : 'qemu-system-x86_64'
  const exePath =
    process.platform === 'darwin' ? path.join(base, 'bin', exeName) : path.join(base, exeName)
  if (fs.existsSync(exePath)) return path.dirname(exePath)
  return null
}

function findSystemQemu(): string | null {
  if (process.platform === 'darwin') {
    for (const p of ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']) {
      const qemu = path.join(p, 'qemu-system-x86_64')
      if (fs.existsSync(qemu)) return p
    }
  }
  if (process.platform === 'win32') {
    const envPath = process.env.PATH || ''
    for (const d of envPath.split(path.delimiter)) {
      const qemu = path.join(d.trim(), 'qemu-system-x86_64.exe')
      if (fs.existsSync(qemu)) return d.trim()
    }
  }
  try {
    const { execSync } = require('child_process')
    execSync('qemu-system-x86_64 --version', { stdio: 'pipe' })
    return ''
  } catch {
    return null
  }
}

/** 执行完整环境检查 */
export async function checkEnvironment(): Promise<EnvCheckResult> {
  const checks: EnvCheckItem[] = []
  const platform = `${process.platform}-${process.arch}`

  // 1. QEMU
  const bundledQemu = getBundledQemuDir()
  const systemQemu = findSystemQemu()
  if (bundledQemu || systemQemu) {
    checks.push({
      id: 'qemu',
      name: 'QEMU',
      status: 'ok',
      message: bundledQemu ? '内置 QEMU 已就绪' : '系统 QEMU 已就绪',
      fixable: false,
    })
  } else {
    const fixHint =
      process.platform === 'win32'
        ? '自动下载便携版 QEMU（约 250MB）'
        : process.platform === 'darwin'
          ? '尝试从 Homebrew 复制或安装'
          : '请手动安装 QEMU'
    checks.push({
      id: 'qemu',
      name: 'QEMU',
      status: 'error',
      message: '未找到 QEMU',
      fixable: process.platform === 'win32' || process.platform === 'darwin',
      fixHint,
    })
  }

  // 2. 磁盘镜像
  const diskPath = getBundledDiskPath()
  const vmDir = path.join(app.getPath('userData'), 'vm-data')
  const userDiskPath = path.join(vmDir, IMAGE_NAME)
  const hasBundled = !!diskPath
  const hasUserCopy = fs.existsSync(userDiskPath)
  if (hasBundled || hasUserCopy) {
    checks.push({
      id: 'disk-image',
      name: 'Ubuntu 镜像',
      status: 'ok',
      message: hasUserCopy ? '虚拟机磁盘已就绪' : '镜像存在，首次启动将复制',
      fixable: false,
    })
  } else {
    checks.push({
      id: 'disk-image',
      name: 'Ubuntu 镜像',
      status: 'error',
      message: `未找到 ${IMAGE_NAME}，请将镜像放入 resources/ 目录`,
      fixable: false,
      fixHint: '从 Ubuntu Cloud Images 下载并放入应用 resources 目录',
    })
  }

  // 3. node-pty
  try {
    require('node-pty')
    checks.push({
      id: 'node-pty',
      name: 'node-pty',
      status: 'ok',
      message: '终端组件正常',
      fixable: false,
    })
  } catch (e) {
    checks.push({
      id: 'node-pty',
      name: 'node-pty',
      status: 'error',
      message: `加载失败: ${(e as Error)?.message || e}`,
      fixable: false,
      fixHint: '请重新安装应用或运行 npm rebuild node-pty',
    })
  }

  // 4. 端口占用
  const portsInUse: number[] = []
  for (const port of PORTS) {
    if (await isPortInUse(port)) {
      portsInUse.push(port)
    }
  }
  if (portsInUse.length === 0) {
    checks.push({
      id: 'ports',
      name: '网络端口',
      status: 'ok',
      message: `端口 ${PORTS.join(', ')} 可用`,
      fixable: false,
    })
  } else {
    checks.push({
      id: 'ports',
      name: '网络端口',
      status: 'error',
      message: `端口被占用: ${portsInUse.join(', ')}`,
      fixable: false,
      fixHint: '请关闭占用端口的程序，或在配置中修改端口',
    })
  }

  // 5. 内存
  const totalMemMB = Math.floor(os.totalmem() / (1024 * 1024))
  if (totalMemMB >= MIN_MEM_MB) {
    checks.push({
      id: 'memory',
      name: '系统内存',
      status: 'ok',
      message: `可用内存 ${totalMemMB} MB`,
      fixable: false,
    })
  } else {
    checks.push({
      id: 'memory',
      name: '系统内存',
      status: 'warning',
      message: `内存偏低 (${totalMemMB} MB)，建议至少 ${MIN_MEM_MB} MB`,
      fixable: false,
    })
  }

  // 6. 用户数据目录可写
  try {
    const testFile = path.join(app.getPath('userData'), '.env-check-write-test')
    fs.writeFileSync(testFile, 'ok')
    fs.unlinkSync(testFile)
    checks.push({
      id: 'disk-writable',
      name: '数据目录',
      status: 'ok',
      message: '可写',
      fixable: false,
    })
  } catch (e) {
    checks.push({
      id: 'disk-writable',
      name: '数据目录',
      status: 'error',
      message: `无法写入: ${(e as Error)?.message || e}`,
      fixable: false,
    })
  }

  const hasError = checks.some((c) => c.status === 'error')
  return {
    ok: !hasError,
    checks,
    platform,
    arch: process.arch,
  }
}

export interface FixProgress {
  phase: string
  detail?: string
}

/** 尝试修复指定项，返回是否成功 */
export async function fixEnvironment(
  id: string,
  onProgress?: (p: FixProgress) => void
): Promise<{ success: boolean; error?: string }> {
  if (id === 'qemu') {
    return fixQemu(onProgress)
  }
  return { success: false, error: '此项无法自动修复' }
}

function fixQemu(onProgress?: (p: FixProgress) => void): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const platform = process.platform
    if (platform !== 'win32' && platform !== 'darwin') {
      resolve({ success: false, error: '当前平台暂不支持自动安装 QEMU' })
      return
    }

    if (platform === 'win32') {
      onProgress?.({ phase: '正在下载 QEMU 便携版...', detail: '约 250MB，请稍候' })
      const resPath = process.resourcesPath || app.getAppPath()
      const scriptInResources = path.join(resPath, 'scripts', 'download-qemu.js')
      const scriptInApp = path.join(app.getAppPath(), 'scripts', 'download-qemu.js')
      const used = fs.existsSync(scriptInResources) ? scriptInResources : scriptInApp
      const outDir = path.join(resPath, 'qemu')
      const env = {
        ...process.env,
        QEMU_OUTPUT_DIR: outDir,
        https_proxy: process.env.https_proxy || process.env.HTTPS_PROXY,
        http_proxy: process.env.http_proxy || process.env.HTTP_PROXY,
      }
      if (!fs.existsSync(used)) {
        resolve({ success: false, error: '下载脚本不存在，请重新安装应用' })
        return
      }
      const child = spawn(process.execPath, [used], {
        env,
        cwd: path.dirname(used),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      child.stderr?.on('data', (d) => {
        stderr += d.toString()
      })
      child.stdout?.on('data', (d) => {
        const s = d.toString().trim()
        if (s) onProgress?.({ phase: s })
      })
      child.on('close', (code) => {
        if (code === 0) {
          onProgress?.({ phase: 'QEMU 安装完成' })
          resolve({ success: true })
        } else {
          resolve({
            success: false,
            error: stderr || `安装脚本退出码 ${code}`,
          })
        }
      })
      child.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
      return
    }

    if (platform === 'darwin') {
      onProgress?.({ phase: '正在检查 Homebrew...' })
      const { execSync } = require('child_process')
      let hasBrew = false
      try {
        execSync('brew --version', { stdio: 'pipe' })
        hasBrew = true
      } catch {
        // ignore
      }
      if (!hasBrew) {
        resolve({
          success: false,
          error: '未检测到 Homebrew，请先安装: https://brew.sh',
        })
        return
      }
      onProgress?.({ phase: '正在安装 QEMU...' })
      const install = spawn('brew', ['install', 'qemu'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      })
      let err = ''
      install.stderr?.on('data', (d) => {
        err += d.toString()
      })
      install.on('close', (installCode) => {
        if (installCode !== 0) {
          resolve({
            success: false,
            error: err || `brew install qemu 失败 (${installCode})`,
          })
          return
        }
        onProgress?.({ phase: '正在复制到应用目录...' })
        const resPath = process.resourcesPath || app.getAppPath()
        const scriptInResources = path.join(resPath, 'scripts', 'download-qemu.js')
        const scriptInApp = path.join(app.getAppPath(), 'scripts', 'download-qemu.js')
        const used = fs.existsSync(scriptInResources) ? scriptInResources : scriptInApp
        if (!fs.existsSync(used)) {
          resolve({
            success: false,
            error: '复制脚本不存在，请确保已通过 brew install qemu 安装',
          })
          return
        }
        const copyChild = spawn(process.execPath, [used], {
          env: process.env,
          cwd: path.dirname(used),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let copyErr = ''
        copyChild.stderr?.on('data', (d) => {
          copyErr += d.toString()
        })
        copyChild.on('close', (copyCode) => {
          if (copyCode === 0) {
            onProgress?.({ phase: 'QEMU 准备完成' })
            resolve({ success: true })
          } else {
            resolve({
              success: false,
              error: copyErr || `复制失败 (${copyCode})`,
            })
          }
        })
        copyChild.on('error', (e) => {
          resolve({ success: false, error: e.message })
        })
      })
    }
  })
}
