import { useCallback, useMemo, useState } from 'react'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { RoomCanvas, type RoomPalette } from '../shared/RoomCanvas'
import { drawTavernFurniture } from './furniture'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

const PALETTE: RoomPalette = {
  wall: '#8a5a30',
  wallShade: '#5a3818',
  wallHighlight: '#aa7240',
  floor: '#6b4528',
  floorPlank: '#553620',
  floorShade: '#321e10',
  outside: '#1a1008',
}

const SLOTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[7, 5]],
  2: [
    [6, 5],
    [8, 5],
  ],
  3: [
    [5, 5],
    [7, 5],
    [9, 5],
  ],
  4: [
    [5, 4],
    [7, 4],
    [9, 4],
    [11, 4],
  ],
}

function slotsFor(n: number): Array<[number, number]> {
  if (SLOTS[n]) return SLOTS[n]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const col = i % 5
    const row = Math.floor(i / 5)
    out.push([4 + col * 2, 4 + row * 2])
  }
  return out
}

export function TavernInterior({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, away, isDay } = ctx
  const [hover, setHover] = useState(0)

  const drawFurniture = useCallback(drawTavernFurniture, [])
  const occupantSlots = useCallback(slotsFor, [])
  const palette = useMemo(() => PALETTE, [])

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
            ? 'empty tavern'
            : occupants.length === 1
              ? '1 drinking'
              : `${occupants.length} drinking`}
          {' · '}
          {isDay ? '☀ day' : '☾ night'}
        </div>
      </div>

      <div className="scene-stage scene-stage--pixel" onMouseMove={() => setHover((n) => n + 1)}>
        <RoomCanvas
          ctx={ctx}
          palette={palette}
          drawFurniture={drawFurniture}
          occupantSlots={occupantSlots}
          selectedOrgId={selectedOrgId}
          onSelectOrg={onFocusOrg}
          hover={hover}
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
              title="Nearby but not in the tavern"
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
