import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WorldState } from '../../../shared/types'
import { mapThingCard, type ThingCard } from '../../model/map-thing-card'
import { mapThingAt, thingKey, type MapThing } from '../../model/map-things'
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
}

/**
 * What the pointer rests on, when it is a building, a vehicle or a caravan: a small card beside the
 * pointer saying what it is, whose it is and what state it is in. People keep their own name tags and
 * territory keeps its card, so neither is shown here. One DOM element moved in place; the text is read
 * from the world on each render, so it stays current while the pointer rests.
 */
export function ThingHoverCard({ world, cameraRef, viewport, container, enabled }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<MapThing | null>(null)
  const latest = useRef(world)
  latest.current = world

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
      const current = latest.current
      const thing = mapThingAt(
        current,
        {
          x: at.x / TILE + (current.grid.origin_x ?? 0),
          y: at.y / TILE + (current.grid.origin_y ?? 0),
        },
        DRAWN_THINGS,
      )
      if (!thing) return hide()
      el.style.display = 'block'
      el.style.left = `${Math.round(cx + 18)}px`
      el.style.top = `${Math.round(cy + 18)}px`
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
