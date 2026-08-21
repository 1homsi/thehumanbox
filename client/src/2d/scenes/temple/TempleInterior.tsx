import { useCallback, useMemo } from 'react'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { RoomCanvas, type RoomPalette } from '../shared/RoomCanvas'
import { drawTempleFurniture } from './furniture'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

const PALETTE: RoomPalette = {
  wall: '#9a8a6a',
  wallShade: '#6a5840',
  wallHighlight: '#bcae8e',
  floor: '#6e624a',
  floorPlank: '#574c38',
  floorShade: '#332c20',
  outside: '#181410',
}

// Pews span cols 3-5 and 8-10 on rows 6-7; worshippers stand behind
// them (row 5) or in the aisle, with the priest before the altar.
const SLOTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[7, 4]],
  2: [
    [7, 4],
    [5, 5],
  ],
  3: [
    [7, 4],
    [5, 5],
    [9, 5],
  ],
  4: [
    [7, 4],
    [5, 5],
    [9, 5],
    [7, 6],
  ],
}

function slotsFor(n: number): Array<[number, number]> {
  if (SLOTS[n]) return SLOTS[n]
  const out: Array<[number, number]> = [[7, 4]]
  const aisle = [4, 6, 8, 10]
  for (let i = 1; i < n; i++) {
    const col = aisle[(i - 1) % aisle.length]
    const row = i <= aisle.length ? 5 : 7
    out.push([col, row])
  }
  return out
}

export function TempleInterior({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, away, isDay } = ctx

  const drawFurniture = useCallback(drawTempleFurniture, [])
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
            ? 'no one in prayer'
            : occupants.length === 1
              ? '1 in prayer'
              : `${occupants.length} in prayer`}
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
              title="Nearby but not in the temple"
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
