import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WorldState } from '../../../shared/types'
import { mapThingCard, type ThingCard } from '../../model/map-thing-card'
import { leavesTribeCard, mapThingAt, thingKey, type MapThing, type TilePoint } from '../../model/map-things'
import { groundIsNotable, terrainAt } from '../../model/map-terrain'
import { lineageAtTerritoryTile, type TerritoryIndex } from '../../model/territory'
import { TILE } from '../../model/palette'
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
 * What the pointer rests on, when it is a thing (an animal, a building, a vehicle, a field, a tree...) or
 * bare ground that no tribe claims: a small card beside the pointer saying what it is. People keep their
 * own name tags, and claimed land keeps the tribe's card (which names the ground too). One DOM element
 * moved in place; the text is read from the world on each render, so it stays current while the pointer rests.
 */
export function ThingHoverCard({ world, cameraRef, viewport, container, enabled, territoryIndex }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<MapThing | null>(null)
  const latest = useRef({ world, territoryIndex })
  latest.current = { world, territoryIndex }

  useEffect(() => {
    const el = box.current
    if (!container || !el) return
    const hide = () => {
      el.style.display = 'none'
      setHover(null)
    }
    // A tool armed while a card shows takes the card down at once, not on the next pointer move.
    if (!enabled) hide()
    const move = (e: PointerEvent) => {
      if (!enabled || e.buttons !== 0 || isMapControl(e.target)) return hide()
      const bounds = container.getBoundingClientRect()
      const cx = e.clientX - bounds.left
      const cy = e.clientY - bounds.top
      const at = screenToMap(cameraRef.current, { x: cx, y: cy }, viewport)
      if (pickPersonAt(at.x, at.y)) return hide()
      const { world: current, territoryIndex: index } = latest.current
      const point = {
        x: at.x / TILE + (current.grid.origin_x ?? 0),
        y: at.y / TILE + (current.grid.origin_y ?? 0),
      }
      const found = mapThingAt(current, point, DRAWN_THINGS)
      // On a tribe's land a tree or planting leaves the tribe's card in place (most of a forest is claimed).
      const thing =
        found &&
        !(leavesTribeCard(found) && lineageAtTerritoryTile(index, Math.floor(point.x), Math.floor(point.y)))
          ? found
          : groundThingAt(current, point, index)
      if (!thing) return hide()
      // A thing whose card is empty (a planting of an unknown kind, a caravan that has just left) shows no box.
      if (!mapThingCard(current, thing)) return hide()
      el.style.display = 'block'
      // Keep the box inside the map: move it back from the right and bottom edges when it would spill over.
      const maxLeft = Math.max(0, bounds.width - el.offsetWidth)
      const maxTop = Math.max(0, bounds.height - el.offsetHeight)
      el.style.left = `${Math.round(Math.min(cx + 18, maxLeft))}px`
      el.style.top = `${Math.round(Math.min(cy + 18, maxTop))}px`
      setHover((prev) => (prev && thingKey(prev) === thingKey(thing) ? prev : thing))
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

  const card = hover ? mapThingCard(world, hover) : null
  // The thing may be gone (a building fell, a caravan arrived) while the pointer still rests: hide the box then.
  useEffect(() => {
    if (!card && box.current) box.current.style.display = 'none'
  }, [card])

  return (
    <div ref={box} aria-hidden="true" style={{ ...CARD, display: 'none' }}>
      {card && <CardText card={card} />}
    </div>
  )
}

/**
 * The bare ground under a point, when no tribe claims its tile. Claimed ground is named in the tribe's
 * card instead, so this stays out of its way.
 */
function groundThingAt(world: WorldState, point: TilePoint, index: TerritoryIndex): MapThing | null {
  const tx = Math.floor(point.x)
  const ty = Math.floor(point.y)
  if (lineageAtTerritoryTile(index, tx, ty)) return null
  return groundIsNotable(terrainAt(world, point.x, point.y)) ? { kind: 'ground', x: tx, y: ty } : null
}

function CardText({ card }: { card: ThingCard }) {
  return (
    <>
      <div style={{ color: '#ffe9a8', fontWeight: 600 }}>{card.title}</div>
      {card.lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </>
  )
}
