import type { SceneContext } from '../../../scenes/core/types'
import { Furniture } from './parts/Furniture'
import { Occupant } from './parts/Occupant'
import { useUIStore } from '../../../stores/store'

interface Props {
  ctx:        SceneContext
  onExit:     () => void
  onFocusOrg: (id: string) => void
}

const VB_W = 100
const VB_H = 100

function occupantSlotsFor(n: number): Array<[number, number]> {
  if (n <= 1) return [[50, 55]]
  if (n === 2) return [[35, 55], [65, 55]]
  if (n === 3) return [[30, 55], [50, 60], [70, 55]]
  if (n === 4) return [[28, 50], [44, 58], [60, 50], [76, 58]]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    out.push([22 + col * 18, 50 + row * 14])
  }
  return out
}

export function HomeInterior({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, fixtures, isDay } = ctx

  const wallTone  = isDay ? '#3a2c1f' : '#241a13'
  const floorTone = isDay ? '#5b3f29' : '#3a2818'
  const lightTone = isDay ? 'rgba(255, 220, 160, 0.10)' : 'rgba(255, 160, 70, 0.12)'

  const slots = occupantSlotsFor(occupants.length)

  return (
    <div className="scene-shell">
      <div className="scene-head">
        <button className="scene-back" onClick={onExit} aria-label="Back to map">
          ← back to map
        </button>
        <div className="scene-title-wrap">
          <div className="scene-title">{title}</div>
          <div className="scene-subtitle">{subtitle}</div>
        </div>
        <div className="scene-meta">{isDay ? '☀ day' : '☾ night'}</div>
      </div>

      <div className="scene-stage">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="scene-svg">
          <defs>
            <radialGradient id="hearth-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="rgba(255, 200, 120, 0.35)" />
              <stop offset="100%" stopColor="rgba(255, 200, 120, 0)" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={VB_W} height={VB_H} fill={wallTone} />
          <rect x="6" y="14" width={VB_W - 12} height={VB_H - 22} fill={floorTone} stroke="#1a0e08" strokeWidth="0.6" rx="2" />

          <rect x="6" y="14" width={VB_W - 12} height={VB_H - 22} fill={lightTone} />

          <circle cx="18" cy="70" r="22" fill="url(#hearth-glow)" />

          {fixtures.map((f) => <Furniture key={f.id} fixture={f} />)}

          {occupants.map((o, i) => {
            const [x, y] = slots[i] ?? [50, 55]
            return (
              <Occupant
                key={o.org.id}
                occupant={o}
                x={x}
                y={y}
                selected={o.org.id === selectedOrgId}
                onClick={() => onFocusOrg(o.org.id)}
              />
            )
          })}

          <text x="50" y="11" textAnchor="middle" fontSize="3.5" fill="#8b8270"
                style={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
            {occupants.length === 1 ? 'alone' : `${occupants.length} inside`}
          </text>
        </svg>
      </div>

      <div className="scene-occupants">
        {occupants.map((o) => (
          <button
            key={o.org.id}
            className={'scene-occupant-chip' + (o.org.id === selectedOrgId ? ' active' : '')}
            onClick={() => onFocusOrg(o.org.id)}
          >
            <span className="scene-occupant-role">{o.role}</span>
            <span className="scene-occupant-name">{o.org.name}</span>
            <span className="scene-occupant-act">{o.activity}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
