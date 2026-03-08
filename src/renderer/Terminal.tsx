import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  visible: boolean
}

export function Terminal({ visible }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const term = new XTerm({
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79b8ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      // Windows 需 Segoe UI Emoji / Cascadia Code 才能正确渲染 emoji；macOS Menlo/Monaco 已支持
      fontFamily: '"Cascadia Code", "Cascadia Mono", Menlo, Monaco, Consolas, "Courier New", "Segoe UI Emoji", "Noto Color Emoji", monospace',
      fontSize: 14,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    term.onData((data) => {
      window.electronAPI?.qemu?.sendInput?.(data)
    })

    // 不在此处 resize PTY，仅通过窗口 resize 事件（防抖）同步，避免触发 resize lock-down

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    return () => {
      initializedRef.current = false
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doResize = useCallback(() => {
    const term = terminalRef.current
    if (term && term.cols >= 40 && term.rows >= 10 && window.electronAPI?.qemu?.sendDimensions) {
      window.electronAPI.qemu.sendDimensions(term.cols, term.rows)
    }
  }, [])

  // 当 visible 变为 true 时仅 fit，不立即同步 PTY（避免触发 resize lock-down 乱码）
  useEffect(() => {
    if (visible) {
      fitAddonRef.current?.fit()
    }
  }, [visible])

  useEffect(() => {
    if (!terminalRef.current || !window.electronAPI?.qemu) return

    const term = terminalRef.current

    window.electronAPI.qemu.onData((data: string) => {
      term.write(data)
    })

    const removeDimensions = window.electronAPI.qemu.onRequestDimensions?.(() => {
      fitAddonRef.current?.fit()
      const t = terminalRef.current
      if (t && t.cols >= 40 && t.rows >= 10) {
        window.electronAPI.qemu.sendDimensions?.(t.cols, t.rows)
      }
    })

    return () => removeDimensions?.()
  }, [])

  useEffect(() => {
    const handleResize = () => {
      fitAddonRef.current?.fit()
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = setTimeout(doResize, 500)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
    }
  }, [doResize])

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        padding: '16px 20px',
      }}
    >
      {!visible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            zIndex: 1,
          }}
        >
          启动虚拟机后将在此显示终端
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: 12,
          minHeight: 0,
          background: '#0d1117',
          visibility: visible ? 'visible' : 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
