import { contextBridge, ipcRenderer } from 'electron'
import type { VMConfig } from '../types'

contextBridge.exposeInMainWorld('electronAPI', {
  qemu: {
    start: (config: VMConfig) => ipcRenderer.invoke('qemu:start', config),
    stop: () => ipcRenderer.invoke('qemu:stop'),
    status: () => ipcRenderer.invoke('qemu:status'),
    sendKey: (key: string) => ipcRenderer.invoke('qemu:sendKey', key),
    onData: (cb: (data: string) => void) => {
      ipcRenderer.on('qemu:data', (_, data) => cb(data))
    },
    onExit: (cb: (code: number) => void) => {
      ipcRenderer.on('qemu:exit', (_, code) => cb(code))
    },
    onError: (cb: (msg: string) => void) => {
      ipcRenderer.on('qemu:error', (_, msg) => cb(msg))
    },
    sendInput: (data: string) => ipcRenderer.send('qemu:input', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('qemu:resize', cols, rows),
    onRequestDimensions: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('qemu:requestDimensions', handler)
      return () => ipcRenderer.removeListener('qemu:requestDimensions', handler)
    },
    sendDimensions: (cols: number, rows: number) => ipcRenderer.send('qemu:dimensions', cols, rows),
    onTunnelReady: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('qemu:tunnelReady', handler)
      return () => ipcRenderer.removeListener('qemu:tunnelReady', handler)
    },
    onProgress: (cb: (msg: string) => void) => {
      const handler = (_: unknown, msg: string) => cb(msg)
      ipcRenderer.on('qemu:progress', handler)
      return () => ipcRenderer.removeListener('qemu:progress', handler)
    },
    onOpenClawToken: (cb: (token: string) => void) => {
      const handler = (_: unknown, token: string) => cb(token)
      ipcRenderer.on('qemu:openclawToken', handler)
      return () => ipcRenderer.removeListener('qemu:openclawToken', handler)
    },
  },
  quitApp: () => ipcRenderer.invoke('app:quit'),
  minimizeToTray: () => ipcRenderer.invoke('app:minimizeToTray'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  vm: {
    getDefaultConfig: () => ipcRenderer.invoke('vm:getDefaultConfig'),
    saveConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('vm:saveConfig', config),
    ensureImage: () => ipcRenderer.invoke('vm:ensureImage'),
    getImageStatus: () => ipcRenderer.invoke('vm:getImageStatus'),
  },
  getDebugInfo: () => ipcRenderer.invoke('get-debug-info'),
  getDebugLog: () => ipcRenderer.invoke('get-debug-log') as Promise<string>,
})
