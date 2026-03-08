import { useState, useEffect, useCallback, useRef } from 'react'
import { Terminal } from './Terminal'
import { ConfigPanel } from './ConfigPanel'
import type { VMConfig } from '../types'
import logoImg from '../assets/easyclaw.png'

declare global {
  interface Window {
    electronAPI: {
      qemu: {
        start: (config: VMConfig) => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<boolean>
        status: () => Promise<{ running: boolean }>
        onData: (cb: (data: string) => void) => void
        onExit: (cb: (code: number) => void) => void
        onError: (cb: (msg: string) => void) => void
        onProgress: (cb: (msg: string) => void) => (() => void) | undefined
        onTunnelReady: (cb: () => void) => (() => void) | undefined
        sendInput: (data: string) => void
      }
      quitApp?: () => Promise<void>
      minimizeToTray?: () => Promise<void>
      relaunch?: () => Promise<void>
      openExternal?: (url: string) => Promise<void>
      vm: {
        getDefaultConfig: () => Promise<VMConfig>
        saveConfig: (config: Record<string, unknown>) => Promise<boolean>
        ensureImage: () => Promise<{ success: boolean; path: string; error?: string }>
        getImageStatus: () => Promise<{
          exists: boolean
          path: string
          size?: number
          isDefault: boolean
        }>
      }
      getDebugInfo: () => Promise<{
        logFile: string
        userData: string
        resourcesPath: string
        defaultApp: boolean
      }>
    }
  }
}

const EMBED_URL_DEFAULT = 'http://localhost:18790/'

const IconTerminal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)
const IconLobster = () => <span style={{ fontSize: 16 }}>🦞</span>
const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconExternal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)
const IconMinimize = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

/** 涂鸦风格的 EasyClaw 标题 SVG - 手写描边感 */
const LogoDoodle = () => (
  <svg
    width="125"
    height="24"
    viewBox="0 0 125 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block' }}
  >
    <defs>
      <filter id="doodle-rough" x="-6%" y="-6%" width="112%" height="112%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    <text
      x="2"
      y="18"
      fontFamily="'Comic Sans MS', 'Chalkboard SE', 'Segoe Print', cursive, sans-serif"
      fontSize="18"
      fontWeight="600"
      fill="var(--text-primary)"
      stroke="var(--text-primary)"
      strokeWidth="0.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#doodle-rough)"
      style={{ userSelect: 'none', paintOrder: 'stroke fill' }}
    >
      <tspan>Easy</tspan>
      <tspan fill="var(--danger)" stroke="var(--danger)">Claw</tspan>
    </text>
  </svg>
)

export default function App() {
  const [running, setRunning] = useState(false)
  const [config, setConfig] = useState<VMConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [viewMode, setViewMode] = useState<'terminal' | 'web'>('terminal')
  const [embedUrl, setEmbedUrl] = useState(EMBED_URL_DEFAULT)
  const [progress, setProgress] = useState<string>('')
  const [ready, setReady] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [showModelTip, setShowModelTip] = useState(false)
  const webviewRef = useRef<HTMLElement & { reload: () => void } | null>(null)

  const MODEL_TIP_KEY = 'easyclaw-model-tip-seen'

  const checkStatus = useCallback(async () => {
    const s = await window.electronAPI.qemu.status()
    setRunning(s.running)
  }, [])

  const loadConfig = useCallback(async () => {
    const cfg = await window.electronAPI.vm.getDefaultConfig()
    setConfig(cfg)
  }, [])

  const handleStart = useCallback(async () => {
    if (!config) return
    setError(null)
    setReady(false)
    setProgress('')
    const result = await window.electronAPI.qemu.start(config)
    if (result.success) {
      setRunning(true)
    } else {
      setError(result.error || '启动失败')
    }
  }, [config])

  useEffect(() => {
    loadConfig()
    checkStatus()
  }, [loadConfig, checkStatus])

  // 启动时自动启动虚拟机（仅执行一次）
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!config || running || autoStartedRef.current) return
    autoStartedRef.current = true
    const timer = setTimeout(() => handleStart(), 500)
    return () => clearTimeout(timer)
  }, [config, running, handleStart])

  useEffect(() => {
    window.electronAPI.qemu.onExit(() => {
      setRunning(false)
      setReady(false)
      setProgress('')
    })
    window.electronAPI.qemu.onError((msg) => setError(msg))
  }, [])

  // SSH 隧道就绪后：标记就绪、切换到控制台、重新加载 webview；首次运行弹窗提示配置模型
  useEffect(() => {
    const remove = window.electronAPI.qemu.onTunnelReady?.(() => {
      setReady(true)
      setViewMode('web')
      setTimeout(() => webviewRef.current?.reload?.(), 100)
      if (!localStorage.getItem(MODEL_TIP_KEY)) {
        setShowModelTip(true)
      }
    })
    return () => remove?.()
  }, [])

  // 监听进度
  useEffect(() => {
    const remove = window.electronAPI.qemu.onProgress?.((msg: string) => setProgress(msg))
    return () => remove?.()
  }, [])

  // 收到 OpenClaw token 后更新控制台 URL
  useEffect(() => {
    const remove = window.electronAPI.qemu.onOpenClawToken?.((token: string) => {
      setEmbedUrl(`http://localhost:18790/#token=${token}`)
    })
    return () => remove?.()
  }, [])

  const handleStop = async () => {
    await window.electronAPI.qemu.stop()
    setRunning(false)
    setReady(false)
    setProgress('')
  }

  const handleConfigSave = useCallback(async (cfg: VMConfig) => {
    await window.electronAPI?.vm?.saveConfig?.(cfg)
    setConfig(cfg)
    await window.electronAPI?.relaunch?.()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {isExiting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div style={{ fontSize: 16, color: 'var(--text-primary)' }}>正在退出...</div>
        </div>
      )}
      <header
        style={{
          padding: '12px 20px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoImg} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
          <LogoDoodle />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!running ? (
            <button
              onClick={handleStart}
              style={{
                padding: '6px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
              }}
            >
              启动 OpenClaw
            </button>
          ) : (
            <button
              onClick={handleStop}
              style={{
                padding: '6px 16px',
                background: 'var(--danger)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
              }}
            >
              关闭 OpenClaw
            </button>
          )}
          <button
            onClick={async () => {
              if (isExiting) return
              setIsExiting(true)
              await window.electronAPI?.quitApp?.()
            }}
            disabled={isExiting}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
            }}
          >
            退出
          </button>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: running ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {running ? '● 运行中' : '○ 已停止'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowConfig(true)}
            title="虚拟机配置"
            style={{
              padding: '6px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
            }}
          >
            <IconSettings />
          </button>
          <button
            onClick={() => window.electronAPI?.minimizeToTray?.()}
            title="最小化到托盘"
            style={{
              padding: '6px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
            }}
          >
            <IconMinimize />
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: '8px 20px',
            background: 'rgba(248, 81, 73, 0.15)',
            borderBottom: '1px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {showModelTip && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            localStorage.setItem(MODEL_TIP_KEY, '1')
            setShowModelTip(false)
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>使用提示</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              首次使用 OpenClaw 需要配置模型。请在【配置】→【Models】→【Model Providers】中配置您的模型。
            </div>
            <button
              onClick={() => {
                localStorage.setItem(MODEL_TIP_KEY, '1')
                setShowModelTip(false)
              }}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
              }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {showConfig && config && (
        <ConfigPanel
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfig(false)}
          onSave={handleConfigSave}
        />
      )}

      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {running && !ready && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              background: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontSize: 16, color: 'var(--text-primary)' }}>{progress || '正在启动...'}</div>
          </div>
        )}
        {running && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setViewMode('terminal')}
              title="终端"
              style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: viewMode === 'terminal' ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: viewMode === 'terminal' ? '#fff' : 'var(--text-primary)',
              }}
            >
              <IconTerminal />
              <span>终端</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('web')}
              title="控制台"
              style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: viewMode === 'web' ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: viewMode === 'web' ? '#fff' : 'var(--text-primary)',
              }}
            >
              <IconLobster />
              <span>控制台</span>
            </button>
            {viewMode === 'web' && (
              <>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => webviewRef.current?.reload?.()}
                  title="刷新"
                  style={{
                    padding: '6px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                  }}
                >
                  <IconRefresh />
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.openExternal?.(embedUrl || EMBED_URL_DEFAULT)}
                  title="在本地浏览器中打开"
                  style={{
                    padding: '6px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                  }}
                >
                  <IconExternal />
                </button>
              </>
            )}
          </div>
        )}
        {running && (
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                visibility: viewMode === 'terminal' ? 'visible' : 'hidden',
                zIndex: viewMode === 'terminal' ? 1 : 0,
              }}
            >
              <Terminal visible={running && viewMode === 'terminal'} />
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                visibility: viewMode === 'web' ? 'visible' : 'hidden',
                zIndex: viewMode === 'web' ? 1 : 0,
              }}
            >
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <webview
                  ref={webviewRef}
                  src={ready ? (embedUrl || EMBED_URL_DEFAULT) : 'about:blank'}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                  }}
                  partition="embedded"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
