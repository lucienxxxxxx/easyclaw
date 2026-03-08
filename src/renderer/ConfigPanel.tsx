import { useState, useEffect } from 'react'
import type { VMConfig } from '../types'

interface ConfigPanelProps {
  config: VMConfig
  onChange: (config: VMConfig) => void
  onClose: () => void
  onSave: (config: VMConfig) => void
}

export function ConfigPanel({ config, onChange, onClose, onSave }: ConfigPanelProps) {
  const [draft, setDraft] = useState<VMConfig>(config)
  useEffect(() => setDraft(config), [config])

  const update = (patch: Partial<VMConfig>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onChange(next)
  }

  const handleSave = () => {
    onSave(draft)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 520,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 20, fontSize: 16 }}>虚拟机配置</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          内存 (MB)
        </label>
        <input
          type="number"
          min={256}
          max={16384}
          step={256}
          value={draft.memory}
          onChange={(e) => update({ memory: parseInt(e.target.value) || 512 })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          CPU 核心数
        </label>
        <input
          type="number"
          min={1}
          max={16}
          value={draft.cpus}
          onChange={(e) => update({ cpus: parseInt(e.target.value) || 1 })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          磁盘大小 (GB)
        </label>
        <input
          type="number"
          min={1}
          max={256}
          value={draft.diskSize}
          onChange={(e) => update({ diskSize: parseInt(e.target.value) || 8 })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          自动登录延迟 (秒，0=禁用)
        </label>
        <input
          type="number"
          min={0}
          max={60}
          value={draft.autoLoginDelay ?? 12}
          onChange={(e) => update({ autoLoginDelay: parseInt(e.target.value) || 0 })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          SSH 端口 (主机)
        </label>
        <input
          type="number"
          min={1024}
          max={65535}
          value={draft.sshPort ?? 2222}
          onChange={(e) => update({ sshPort: parseInt(e.target.value) || 2222 })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          ssh -p {draft.sshPort ?? 2222} ubuntu@localhost
        </span>
      </div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
            }}
          >
            保存并重启
          </button>
        </div>
      </div>
    </div>
  )
}
