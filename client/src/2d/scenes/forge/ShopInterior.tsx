import { useCallback, useMemo, useState } from 'react'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { RoomCanvas, type RoomPalette } from '../shared/RoomCanvas'
import { drawShopFurniture } from './furniture'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

const PALETTES: Record<string, RoomPalette> = {
  forge: {
    wall: '#4a3828',
    wallShade: '#2a1e14',
    wallHighlight: '#624a34',
    floor: '#3a322a',
    floorPlank: '#2a221a',
    floorShade: '#1a1410',
    outside: '#0a0805',
  },
  bakery: {
    wall: '#7a5a30',
    wallShade: '#52381a',
    wallHighlight: '#a07a48',
    floor: '#9a6e3e',
    floorPlank: '#7a5028',
    floorShade: '#3a2410',
    outside: '#1a1208',
  },
  mill: {
    wall: '#8a7458',
    wallShade: '#5a4a34',
    wallHighlight: '#a89072',
    floor: '#7a6450',
    floorPlank: '#5a4838',
    floorShade: '#332a20',
    outside: '#100c08',
  },
}

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
      [5, 6],
      [7, 7],
      [9, 6],
    ]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    out.push([4 + col * 2, 5 + row * 2])
  }
  return out
}

export function ShopInterior({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, away, isDay, scene } = ctx
  const [hover, setHover] = useState(0)

  const kind = scene.kind === 'forge' ? 'forge' : scene.kind === 'bakery' ? 'bakery' : 'mill'
  const palette = useMemo(() => PALETTES[kind], [kind])
  const drawFurniture = useCallback(drawShopFurniture, [])
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
            ? 'shop closed'
            : occupants.length === 1
              ? '1 at work'
              : `${occupants.length} at work`}
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
              title="Nearby"
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
