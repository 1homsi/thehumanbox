import { useCallback, useMemo } from 'react'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { RoomCanvas, type RoomPalette } from '../shared/RoomCanvas'
import { drawSettlementFurniture } from './furniture'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

const PALETTE: RoomPalette = {
  wall: '#5a3e22',
  wallShade: '#3a2818',
  wallHighlight: '#7c5638',
  floor: '#6b5028',
  floorPlank: '#523c20',
  floorShade: '#332518',
  outside: '#1a1208',
}

// Huts occupy (1,7) and (11,7); the square fire burns at (6,5).
// Keep occupants between the fixtures.
function slotsFor(n: number): Array<[number, number]> {
  if (n === 0) return []
  if (n === 1) return [[7, 6]]
  if (n === 2)
    return [
      [5, 6],
      [9, 6],
    ]
  if (n === 3)
    return [
      [5, 7],
      [7, 6],
      [9, 7],
    ]
  if (n === 4)
    return [
      [4, 6],
      [6, 7],
      [9, 6],
      [10, 5],
    ]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const col = 3 + (i % 4) * 2
    const row = i < 4 ? 5 : 7
    out.push([col, row])
  }
  return out
}

export function SettlementInterior({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, away, isDay } = ctx

  const palette = useMemo(() => PALETTE, [])
  const drawFurniture = useCallback(drawSettlementFurniture, [])
  const occupantSlots = useCallback(slotsFor, [])

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
        <div className="scene-meta">
          {occupants.length === 0
            ? 'empty square'
            : occupants.length === 1
              ? '1 in the square'
              : `${occupants.length} in the square`}
          {' · '}
          {isDay ? '☀ day' : '☾ night'}
        </div>
      </div>

      <div className="scene-stage scene-stage--pixel">
        <RoomCanvas
          ctx={ctx}
          palette={palette}
          drawFurniture={drawFurniture}
          occupantSlots={occupantSlots}
          selectedOrgId={selectedOrgId}
          onSelectOrg={onFocusOrg}
        />
      </div>

      {(occupants.length > 0 || away.length > 0) && (
        <div className="scene-occupants">
          {occupants.map((o) => (
            <button
              key={`in-${o.org.id}`}
              className={'scene-occupant-chip' + (o.org.id === selectedOrgId ? ' active' : '')}
              onClick={() => onFocusOrg(o.org.id)}
            >
              <span className="scene-occupant-role">{o.role}</span>
              <span className="scene-occupant-name">{o.org.name}</span>
              <span className="scene-occupant-act">{o.activity}</span>
            </button>
          ))}
          {away.map((o) => (
            <button
              key={`out-${o.org.id}`}
              className={
                'scene-occupant-chip scene-occupant-chip--away' +
                (o.org.id === selectedOrgId ? ' active' : '')
              }
              onClick={() => onFocusOrg(o.org.id)}
              title="In the village but not in the square"
            >
              <span className="scene-occupant-role">{o.role} · nearby</span>
              <span className="scene-occupant-name">{o.org.name}</span>
              <span className="scene-occupant-act">{o.activity}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
