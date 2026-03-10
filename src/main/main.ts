import { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { QemuManager } from './qemu'
import { checkEnvironment, fixEnvironment, type EnvCheckResult } from './env-checker'

let LOG_FILE = ''

function debug(...args: unknown[]) {
  const msg = `[${new Date().toISOString()}] [main] ${args.map((a) =>
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ')}`
  console.log(msg)
  try {
    if (!LOG_FILE) LOG_FILE = path.join(app.getPath('userData'), 'easyclaw-debug.log')
    fs.appendFileSync(LOG_FILE, msg + '\n')
  } catch {
    // ignore
  }
}

function isExpectedConnectionReset(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException | undefined
  const code = e?.code
  return code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED'
}

// Windows 上网络流在断开时偶发 ECONNRESET，避免触发主进程崩溃弹窗
process.on('uncaughtException', (err) => {
  if (isExpectedConnectionReset(err)) {
    debug('忽略可预期连接错误 uncaughtException:', (err as Error).message)
    return
  }
  debug('uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  if (isExpectedConnectionReset(reason)) {
    debug('忽略可预期连接错误 unhandledRejection:', String(reason))
    return
  }
  debug('unhandledRejection:', reason)
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const qemuManager = new QemuManager()

app.setName('EasyClaw')
debug('main.ts 加载完成, userData=', app.getPath('userData'))
debug('__dirname=', __dirname, 'preload路径=', path.join(__dirname, 'preload.js'))

function getIconPath(): string | undefined {
  // 开发时 __dirname=dist/main，打包后 __dirname=app.asar/dist/main；build 需在 package.json files 中
  const buildDir = path.join(__dirname, '..', '..', 'build')
  const ext = process.platform === 'win32' ? '.ico' : process.platform === 'darwin' ? '.icns' : '.png'
  const pngPath = path.join(buildDir, 'easyclaw.png')
  const iconPath = path.join(buildDir, 'icon' + ext)
  if (fs.existsSync(iconPath)) return iconPath
  if (fs.existsSync(pngPath)) return pngPath
  return undefined
}

function getTrayIconPath(): string | undefined {
  const base = path.join(__dirname, '../../build/icon')
  const pngPath = path.join(__dirname, '../../build/easyclaw.png')
  if (fs.existsSync(pngPath)) return pngPath
  const ext = process.platform === 'win32' ? '.ico' : '.png'
  const p = base + ext
  return fs.existsSync(p) ? p : undefined
}

function createTray() {
  if (tray) return
  const iconPath = getTrayIconPath()
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : null
  if (!icon || icon.isEmpty()) {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2NkYGD4z0ABYBw1gJGBgYGBEpMYR8OAkYGBgYGBEpMYR8OAkYGBgQEAUhgGBUq6LuAAAAAASUVORK5CYII=')
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('EasyClaw')
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示', click: () => mainWindow?.show() },
    { type: 'separator' as const },
    { label: '退出', click: () => app.quit() },
  ]))
  debug('托盘已创建')
}

function createWindow() {
  debug('createWindow 开始')
  const iconPath = getIconPath()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  const loadUrl = isDev ? 'http://localhost:5173' : path.join(__dirname, '../renderer/index.html')
  debug('isDev=', isDev, 'loadUrl=', loadUrl)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      debug('loadURL 失败:', err)
    })
    mainWindow.webContents.openDevTools()
    debug('DevTools 已打开')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch((err) => {
      debug('loadFile 失败:', err)
    })
  }

  mainWindow.webContents.on('did-finish-load', () => {
    debug('页面加载完成')
    qemuManager.setWebContents(mainWindow!.webContents)
    mainWindow!.setMenuBarVisibility(false)
  })

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    debug('页面加载失败: code=', code, 'desc=', desc)
  })

  mainWindow.on('close', (e) => {
    if (qemuManager.getStatus().running) {
      e.preventDefault()
      const win = mainWindow
      qemuManager.stop(true).then(() => {
        mainWindow = null
        win?.destroy()
      })
    }
  })

  mainWindow.on('closed', () => {
    qemuManager.setWebContents(null)
    mainWindow = null
  })

  mainWindow.show()
  createTray()
  debug('窗口已创建并显示, 日志文件:', LOG_FILE)
}

function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { role: 'close' as const },
        { role: 'quit' as const },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { role: 'about' as const },
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}


function checkHardwareRequirements(): boolean {
  const totalMemMB = Math.floor(os.totalmem() / (1024 * 1024))
  const cpuCount = os.cpus().length
  debug(`宿主机: ${totalMemMB}MB 内存, ${cpuCount} 核 CPU`)

  const MIN_MEM_MB = 2048
  const MIN_CPUS = 2
  const issues: string[] = []

  if (totalMemMB < MIN_MEM_MB) {
    issues.push(`内存不足：当前 ${totalMemMB}MB，最低需要 ${MIN_MEM_MB}MB`)
  }
  if (cpuCount < MIN_CPUS) {
    issues.push(`CPU 核心不足：当前 ${cpuCount} 核，最低需要 ${MIN_CPUS} 核`)
  }

  if (issues.length > 0) {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'EasyClaw - 硬件不满足最低要求',
      message: '当前设备硬件配置可能无法正常运行虚拟机',
      detail: issues.join('\n') + '\n\n建议在配置更高的设备上使用 EasyClaw。',
      buttons: ['继续运行', '退出'],
      defaultId: 1,
      cancelId: 1,
    })
    if (result === 1) {
      return false
    }
  }
  return true
}

app.whenReady().then(() => {
  debug('app.whenReady 触发')
  if (!checkHardwareRequirements()) {
    app.quit()
    return
  }
  setupMenu()
  createWindow()
}).catch((err) => {
  debug('app.whenReady 异常:', err)
})

app.on('window-all-closed', () => {
  qemuManager.stop(false)
  debug('所有窗口已关闭')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 环境检查：启动前完整审查，缺少则尝试自动安装
ipcMain.handle('env:check', async (): Promise<EnvCheckResult> => {
  debug('IPC env:check')
  return checkEnvironment()
})

ipcMain.handle('env:fix', async (_, id: string): Promise<{ success: boolean; error?: string }> => {
  debug('IPC env:fix', id)
  const wc = BrowserWindow.getAllWindows()[0]?.webContents
  return fixEnvironment(id, (p) => {
    wc?.send('qemu:progress', p.phase + (p.detail ? ` - ${p.detail}` : ''))
  })
})

// IPC handlers for QEMU
ipcMain.handle('qemu:start', async (_, config) => {
  debug('IPC qemu:start', config)
  const wc = BrowserWindow.getAllWindows()[0]?.webContents
  wc?.send('qemu:progress', '正在检查运行环境...')
  // 启动前环境审查
  const envResult = await checkEnvironment()
  if (!envResult.ok) {
    const errorItems = envResult.checks.filter((c) => c.status === 'error')
    const fixable = errorItems.filter((c) => c.fixable)
    if (fixable.length > 0) {
      debug('尝试自动修复:', fixable.map((c) => c.id))
      for (const item of fixable) {
        const wc = BrowserWindow.getAllWindows()[0]?.webContents
        const fixResult = await fixEnvironment(item.id, (p) => {
          wc?.send('qemu:progress', p.phase + (p.detail ? ` (${p.detail})` : ''))
        })
        if (fixResult.success) {
          debug('自动修复成功:', item.id)
        } else {
          debug('自动修复失败:', item.id, fixResult.error)
        }
      }
      const recheck = await checkEnvironment()
      if (!recheck.ok) {
        const msgs = recheck.checks
          .filter((c) => c.status === 'error')
          .map((c) => `${c.name}: ${c.message}`)
        return { success: false, error: '环境检查未通过：\n' + msgs.join('\n') }
      }
    } else {
      const msgs = errorItems.map((c) => `${c.name}: ${c.message}`)
      return { success: false, error: '环境检查未通过：\n' + msgs.join('\n') }
    }
  }
  return qemuManager.start(config)
})

ipcMain.handle('qemu:stop', async (_, poweroff?: boolean) => {
  return qemuManager.stop(poweroff !== false)
})

ipcMain.handle('qemu:status', async () => {
  return qemuManager.getStatus()
})

ipcMain.handle('qemu:sendKey', async (_, key) => {
  qemuManager.sendKey(key)
})
ipcMain.on('qemu:input', (_, data: string) => {
  qemuManager.writeToTerminal(data)
})
ipcMain.on('qemu:resize', (_, cols: number, rows: number) => {
  qemuManager.resize(cols, rows)
})
ipcMain.on('qemu:dimensions', (_, cols: number, rows: number) => {
  qemuManager.setGuestTerminalSize(cols, rows)
})

const CONFIG_FILE = 'vm-config.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

ipcMain.handle('vm:getDefaultConfig', async () => {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8')
      const loaded = JSON.parse(raw)
      return { ...qemuManager.getDefaultConfig(), ...loaded }
    }
  } catch {
    // ignore, use defaults
  }
  return qemuManager.getDefaultConfig()
})

ipcMain.handle('vm:saveConfig', async (_, config: Record<string, unknown>) => {
  const p = getConfigPath()
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8')
  return true
})

ipcMain.handle('app:relaunch', async () => {
  if (qemuManager.getStatus().running) {
    await qemuManager.stop(true)
  }
  app.relaunch()
  app.quit()
})

ipcMain.handle('vm:ensureImage', async () => {
  return qemuManager.ensureDefaultImage()
})

ipcMain.handle('vm:getImageStatus', async () => {
  return qemuManager.getImageStatus()
})

ipcMain.handle('get-debug-info', async () => {
  if (!LOG_FILE) LOG_FILE = path.join(app.getPath('userData'), 'easyclaw-debug.log')
  return {
    logFile: LOG_FILE,
    userData: app.getPath('userData'),
    resourcesPath: process.resourcesPath,
    defaultApp: process.defaultApp,
  }
})

ipcMain.handle('get-debug-log', async () => {
  if (!LOG_FILE) LOG_FILE = path.join(app.getPath('userData'), 'easyclaw-debug.log')
  try {
    return fs.readFileSync(LOG_FILE, 'utf8')
  } catch {
    return ''
  }
})

ipcMain.handle('app:quit', async () => {
  if (qemuManager.getStatus().running) {
    await qemuManager.stop(true)
  }
  app.quit()
})

ipcMain.handle('app:minimizeToTray', () => {
  if (mainWindow) {
    mainWindow.hide()
    createTray()
  }
})

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  await shell.openExternal(url)
})
