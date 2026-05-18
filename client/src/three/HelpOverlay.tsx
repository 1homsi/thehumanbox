import { useEffect, useState } from 'react'

export function HelpOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyH' || e.key === '?') {
        setOpen(v => !v)
      } else if (e.code === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) {
    return (
      <button
        className="thb-3d-helpbtn"
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="help (?)"
      >
        ?
      </button>
    )
  }

  return (
    <div className="thb-3d-help" style={wrap} onClick={() => setOpen(false)}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={title}>controls</div>
        <Row k="click"    v="capture mouse for look" />
        <Row k="esc"      v="release mouse / exit follow" />
        <Row k="WASD"     v="fly horizontally" />
        <Row k="space"    v="rise" />
        <Row k="shift"    v="descend" />
        <Row k="ctrl"     v="boost (4× speed)" />
        <div style={spacer} />
        <Row k="click org"   v="select an organism" />
        <Row k="F"           v="toggle follow selected" />
        <Row k="J"           v="jump camera to selected" />
        <Row k="R"           v="random org + follow them" />
        <Row k="click map"   v="teleport camera anywhere" />
        <div style={spacer} />
        <Row k="?"   v="toggle this help" />
        <div style={hint}>press ? or click outside to close</div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={row}>
      <span style={kbd}>{k}</span>
      <span style={desc}>{v}</span>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(12, 16, 24, 0.75)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#cad3df',
  fontFamily: 'monospace',
  fontSize: 14,
  cursor: 'pointer',
  pointerEvents: 'auto',
  zIndex: 6,
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0,0,0,0.35)',
  zIndex: 9,
  pointerEvents: 'auto',
  backdropFilter: 'blur(2px)',
}

const card: React.CSSProperties = {
  width: 320,
  padding: '20px 22px',
  background: 'rgba(12, 16, 24, 0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#cad3df',
  fontFamily: 'monospace',
  fontSize: 12,
  letterSpacing: '0.04em',
  pointerEvents: 'auto',
}

const title: React.CSSProperties = {
  fontSize: 14,
  color: '#ffffff',
  marginBottom: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 4,
}

const kbd: React.CSSProperties = {
  width: 80,
  padding: '2px 6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 3,
  textAlign: 'center',
  fontSize: 11,
}

const desc: React.CSSProperties = {
  flex: 1,
  opacity: 0.8,
}

const spacer: React.CSSProperties = {
  height: 8,
}

const hint: React.CSSProperties = {
  marginTop: 12,
  fontSize: 10,
  opacity: 0.5,
  textAlign: 'center',
}
