import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { lineageColor } from '../../../shared/constants'
import type { WorldState } from '../../../shared/types'
import { territoryCardFacts, type TerritoryCardFacts } from '../../model/territory-card'
import { lineageAtTerritoryTile, territoryTileKey, type TerritoryIndex } from '../../model/territory'
import { TILE } from '../../model/palette'
import { isMapControl, screenToMap, type MapCamera, type MapSize } from '../camera-controls'
import { pickBuildingAt, pickPersonAt } from '../cf/picking'

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
  container: HTMLDivElement | null
  /** Off while a tool is armed: the pointer is then placing things, not reading them. */
  enabled: boolean
  territoryIndex: TerritoryIndex
}

const CARD: CSSProperties = {
  position: 'absolute',
  zIndex: 15,
  pointerEvents: 'none',
  minWidth: 140,
  maxWidth: 220,
  padding: '6px 8px',
  background: 'rgba(20, 15, 10, 0.94)',
  border: '1px solid #c9a24a',
  borderRadius: 3,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
  color: '#f1e6c8',
  font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
}

/**
 * The tribe whose land the pointer rests on, as a small card: its name, how many people it has, who
 * leads it, its era and how unevenly its wealth is shared. Shown over claimed land only; a person,
 * a building or an animal under the pointer keeps its own outline and no card. One DOM element moved
 * in place; the text is re-read from the world on each frame, so it stays current.
 */
export function TerritoryHoverCard({
  world,
  cameraRef,
  viewport,
  container,
  enabled,
  territoryIndex,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ lineage: string; contested: boolean } | null>(null)
  const latest = useRef({ territoryIndex, ox: 0, oy: 0 })
  latest.current = {
    territoryIndex,
    ox: world.grid.origin_x ?? 0,
    oy: world.grid.origin_y ?? 0,
  }

  useEffect(() => {
    const el = box.current
    if (!container || !el) return
    const hide = () => {
      el.style.display = 'none'
      setHover(null)
    }
    const move = (e: PointerEvent) => {
      if (!enabled || e.buttons !== 0 || isMapControl(e.target)) return hide()
      const bounds = container.getBoundingClientRect()
      const cx = e.clientX - bounds.left
      const cy = e.clientY - bounds.top
      const at = screenToMap(cameraRef.current, { x: cx, y: cy }, viewport)
      if (pickPersonAt(at.x, at.y) || (pickBuildingAt(at.x, at.y) ?? -1) >= 0) return hide()
      const { territoryIndex: index, ox, oy } = latest.current
      const tx = Math.floor(at.x / TILE) + ox
      const ty = Math.floor(at.y / TILE) + oy
      const lineage = lineageAtTerritoryTile(index, tx, ty)
      if (!lineage) return hide()
      el.style.display = 'block'
      el.style.left = `${Math.round(cx + 18)}px`
      el.style.top = `${Math.round(cy + 18)}px`
      const contested = index.contested.has(territoryTileKey(tx, ty))
      setHover((prev) =>
        prev && prev.lineage === lineage && prev.contested === contested ? prev : { lineage, contested },
      )
    }
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerleave', hide)
    container.addEventListener('wheel', hide)
    return () => {
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerleave', hide)
      container.removeEventListener('wheel', hide)
    }
  }, [container, cameraRef, viewport, enabled])

  const facts = hover ? territoryCardFacts(world, hover.lineage, hover.contested) : null
  return (
    <div ref={box} aria-hidden="true" style={{ ...CARD, display: 'none' }}>
      {facts && <TribeFacts facts={facts} lineage={hover?.lineage ?? ''} />}
    </div>
  )
}

function TribeFacts({ facts, lineage }: { facts: TerritoryCardFacts; lineage: string }) {
  return (
    <>
      <div style={{ color: '#ffe9a8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: lineageColor(lineage),
            display: 'inline-block',
          }}
        />
        {facts.name}
      </div>
      <div>
        {facts.people} {facts.people === 1 ? 'person' : 'people'}
        {facts.era ? ` · ${facts.era}` : ''}
      </div>
      <div>
        {facts.leader ? `led by ${facts.leader}` : 'no leader'}
        {facts.government ? ` (${facts.government})` : ''}
      </div>
      {facts.wealthGap && <div>wealth: {facts.wealthGap}</div>}
      {facts.contested && <div style={{ color: '#ffb36b' }}>disputed land</div>}
    </>
  )
}
