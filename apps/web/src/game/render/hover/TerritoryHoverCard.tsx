import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { lineageColor } from '../../../shared/constants'
import type { WorldState } from '../../../shared/types'
import { t } from '../../../i18n'
import { territoryCardFacts, type TerritoryCardFacts } from '../../model/territory-card'
import { lineageAtTerritoryTile, territoryTileKey, type TerritoryIndex } from '../../model/territory'
import { TILE } from '../../model/palette'
import { leavesTribeCard, mapThingAt } from '../../model/map-things'
import { groundLine } from '../../model/map-thing-card'
import { isMapControl, screenToMap, type MapCamera, type MapSize } from '../camera-controls'
import { pickPersonAt } from '../cf/picking'
import { CARD } from './card-style'
import { DRAWN_THINGS } from './drawn-things'

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
  container: HTMLDivElement | null
  /** Off while a tool is armed: the pointer is then placing things, not reading them. */
  enabled: boolean
  territoryIndex: TerritoryIndex
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
  const [hover, setHover] = useState<{ lineage: string; contested: boolean; x: number; y: number } | null>(
    null,
  )
  const latest = useRef({ world, territoryIndex, ox: 0, oy: 0 })
  latest.current = {
    world,
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
      if (pickPersonAt(at.x, at.y)) return hide()
      const { world: current, territoryIndex: index, ox, oy } = latest.current
      const tx = Math.floor(at.x / TILE) + ox
      const ty = Math.floor(at.y / TILE) + oy
      // A building, vehicle or caravan under the pointer has its own card (see ThingHoverCard).
      const thing = mapThingAt(current, { x: at.x / TILE + ox, y: at.y / TILE + oy }, DRAWN_THINGS)
      if (thing && !leavesTribeCard(thing)) return hide()
      const lineage = lineageAtTerritoryTile(index, tx, ty)
      if (!lineage) return hide()
      el.style.display = 'block'
      el.style.left = `${Math.round(cx + 18)}px`
      el.style.top = `${Math.round(cy + 18)}px`
      const contested = index.contested.has(territoryTileKey(tx, ty))
      setHover((prev) =>
        prev && prev.lineage === lineage && prev.contested === contested && prev.x === tx && prev.y === ty
          ? prev
          : { lineage, contested, x: tx, y: ty },
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
  const settlement = hover ? world.settlements?.find((item) => item.lineage_id === hover.lineage) : null
  // The ground under the pointer, in one line, so the tribe's card also says what the land is.
  const ground = hover ? groundLine(world, hover.x + 0.5, hover.y + 0.5) : null
  return (
    <div ref={box} aria-hidden="true" style={{ ...CARD, display: 'none' }}>
      {facts && <TribeFacts facts={facts} lineage={hover?.lineage ?? ''} ground={ground} />}
      {settlement && (
        <div>
          {t('panels.tribe.people', { count: settlement.population })} ·{' '}
          {t('model.territory.buildings', { count: settlement.building_count })}
        </div>
      )}
    </div>
  )
}

function TribeFacts({
  facts,
  lineage,
  ground,
}: {
  facts: TerritoryCardFacts
  lineage: string
  ground: string | null
}) {
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
      {ground && <div>{ground}</div>}
      <div>
        {t('panels.tribe.people', { count: facts.people })}
        {facts.era ? ` · ${facts.era}` : ''}
      </div>
      <div>
        {facts.leader ? `${t('panels.tribe.ledBy')} ${facts.leader}` : t('model.territory.noLeader')}
        {facts.government ? ` (${facts.government})` : ''}
      </div>
      {facts.wealthGap && <div>{t('model.territory.wealthLabel', { value: facts.wealthGap })}</div>}
      {facts.goods && <div>{facts.goods}</div>}
      {facts.trade && <div>{t('model.territory.tradeLabel', { value: facts.trade })}</div>}
      {facts.contested && <div style={{ color: '#ffb36b' }}>{t('model.territory.disputed')}</div>}
    </>
  )
}
