import { useMemo } from 'react'
import type { OrganismState } from '../../../types'
import { lineageColor, cbColor } from '../../../utils/constants'
import { useUIStore } from '../../../stores/store'
import { TILE_SCALE } from './constants'
import { cameraCommand, cameraSnapshot } from './camera-state'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
}

export function SelectedOrgCard({ organisms }: Props) {
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const selectOrg     = useUIStore(s => s.selectOrg)

  const org = useMemo(
    () => organisms.find(o => o.id === selectedOrgId && o.alive),
    [organisms, selectedOrgId],
  )
  if (!org) return null

  const onGo = () => {
    const [tx, ty] = getOrgXY(org.id)
    if (tx === 0 && ty === 0) return
    cameraCommand.teleport = {
      x: tx * TILE_SCALE,
      y: cameraSnapshot.y,
      z: ty * TILE_SCALE + 30,
    }
  }

  return (
    <div className="thb-3d-orgcard" style={wrap}>
      <div style={header}>
        <span style={{
          ...lineageDot,
          background: lineageColor(org.lineage_id),
        }} />
        <span style={name}>{org.name}</span>
        <button style={goBtn} onClick={onGo} title="jump camera here">go</button>
        <button style={dismiss} onClick={() => selectOrg(null)} title="release">×</button>
      </div>
      {org.thought && (
        <div style={thought}>“{org.thought}”</div>
      )}
      <div style={metaRow}>
        <span>age {Math.floor(org.age / 100) / 10}k</span>
        <span>gen {org.generation}</span>
        {org.is_elder && <span style={elderTag}>elder</span>}
        {org.sex && <span style={{ opacity: 0.65 }}>{org.sex}</span>}
      </div>
      <div style={vitals}>
        <Bar label="energy"    value={org.energy}    color="#7ed957" />
        <Bar label="health"    value={org.health}    color="#f6a64a" />
        <Bar label="hydration" value={org.hydration} color="#4fa9d8" />
      </div>
      <div style={hint}>press F to follow · ESC to release</div>
    </div>
  )
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div style={barRow}>
      <span style={barLabel}>{label}</span>
      <div style={barTrack}>
        <div style={{ ...barFill, width: pct + '%', background: cbColor(color) }} />
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  top: 60,
  left: 16,
  width: 240,
  padding: '10px 12px',
  background: 'rgba(12, 16, 24, 0.78)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  color: '#cad3df',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: '0.02em',
  pointerEvents: 'auto',
  zIndex: 6,
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const lineageDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
}

const name: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: '#ffffff',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const goBtn: React.CSSProperties = {
  background: 'rgba(255, 138, 58, 0.18)',
  border: '1px solid rgba(255, 138, 58, 0.40)',
  color: '#ffcf6a',
  fontSize: 10,
  fontFamily: 'monospace',
  padding: '2px 7px',
  borderRadius: 3,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const dismiss: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#cad3df',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  width: 18,
  height: 18,
}

const thought: React.CSSProperties = {
  fontStyle: 'italic',
  color: '#9fb6cc',
  marginBottom: 8,
  fontSize: 10.5,
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 8,
  fontSize: 10.5,
  flexWrap: 'wrap',
}

const elderTag: React.CSSProperties = {
  background: 'rgba(255, 180, 80, 0.18)',
  color: '#ffcf6a',
  padding: '0 5px',
  borderRadius: 2,
  fontSize: 9,
}

const vitals: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  marginBottom: 6,
}

const barRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const barLabel: React.CSSProperties = {
  width: 56,
  fontSize: 9.5,
  opacity: 0.7,
}

const barTrack: React.CSSProperties = {
  flex: 1,
  height: 5,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 2,
  overflow: 'hidden',
}

const barFill: React.CSSProperties = {
  height: '100%',
  transition: 'width 0.2s ease-out',
}

const hint: React.CSSProperties = {
  fontSize: 9,
  opacity: 0.5,
  textAlign: 'center',
  marginTop: 4,
}
