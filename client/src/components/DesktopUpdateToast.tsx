import { useEffect, useState } from 'react'
import { getDesktop, UpdateInfo } from '../lib/desktop'

type State =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloaded'; info: UpdateInfo }

export function DesktopUpdateToast() {
  const desktop = getDesktop()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!desktop) return
    const offAvailable = desktop.on('updater:available', (info) => {
      setState({ kind: 'available', info })
    })
    const offDownloaded = desktop.on('updater:downloaded', (info) => {
      setState({ kind: 'downloaded', info })
      setDismissed(false)
    })
    return () => {
      offAvailable()
      offDownloaded()
    }
  }, [desktop])

  if (!desktop) return null
  if (state.kind === 'idle') return null
  if (dismissed) return null

  const isReady = state.kind === 'downloaded'
  const title = isReady ? 'Update ready to install' : 'Update available'
  const subtitle = isReady
    ? `v${state.info.version} downloaded — restart to apply`
    : `v${state.info.version} downloading…`

  return (
    <div style={wrap}>
      <div style={left}>
        <div style={titleStyle}>{title}</div>
        <div style={subStyle}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {isReady && (
          <button
            style={primaryBtn}
            onClick={() => {
              desktop.app.reload().catch(() => {})
            }}
            title="The main process will quit-and-install on its own dialog; this just reloads the window"
          >
            restart
          </button>
        )}
        <button style={dismissBtn} onClick={() => setDismissed(true)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 1500,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'rgba(20, 17, 13, 0.96)',
  border: '1px solid #5e5648',
  borderLeft: '3px solid #f0c860',
  borderRadius: 6,
  padding: '10px 12px',
  maxWidth: 320,
  fontFamily: 'monospace',
  color: '#d8d2c4',
  boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
}

const left: React.CSSProperties = { flex: 1, minWidth: 0 }

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#f0c860',
  letterSpacing: '0.04em',
  marginBottom: 2,
}

const subStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#999',
}

const primaryBtn: React.CSSProperties = {
  background: 'rgba(240, 200, 96, 0.15)',
  border: '1px solid rgba(240, 200, 96, 0.55)',
  color: '#f0c860',
  padding: '4px 10px',
  borderRadius: 3,
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const dismissBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#777',
  fontSize: 14,
  cursor: 'pointer',
  padding: '2px 6px',
  fontFamily: 'inherit',
}
