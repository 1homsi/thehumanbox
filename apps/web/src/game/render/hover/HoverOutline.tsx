import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type { Building, WorldState } from '../../../shared/types'
import { isMapControl, screenToMap, type MapCamera, type MapSize } from '../camera-controls'
import { pickBuildingAt, pickPersonAt } from '../cf/picking'
import { animalRect, buildingRect, nearestAnimal, personRect, type MapRect } from './hover-target'

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
  container: HTMLDivElement | null
  /** Off while a tool is armed: the pointer is then placing things, not inspecting them. */
  enabled: boolean
}

/**
 * A thin outline round whatever the pointer rests on: a person, a building or an animal. The
 * box is one DOM element moved in place (no React render per move), and it hides while a button
 * is held (a pan) or the pointer is over a control.
 */
export function HoverOutline({ world, cameraRef, viewport, container, enabled }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const people = useMemo(() => new Map(world.organisms.map((o) => [o.id, o])), [world.organisms])
  const buildings = useMemo(
    () => new Map<number, Building>((world.buildings ?? []).map((b) => [b.id, b])),
    [world.buildings],
  )
  const animals = world.animals
  // The listener reads the latest data without being re-attached on every world frame.
  const latest = useRef({ people, buildings, animals, ox, oy })
  latest.current = { people, buildings, animals, ox, oy }

  useEffect(() => {
    const el = box.current
    if (!container || !el) return
    const hide = () => {
      el.style.display = 'none'
    }
    const show = (r: MapRect) => {
      const cam = cameraRef.current
      const zoom = Math.max(0.01, cam.zoom)
      el.style.display = 'block'
      el.style.left = `${Math.round((r.x - cam.x) * zoom + viewport.w / 2)}px`
      el.style.top = `${Math.round((r.y - cam.y) * zoom + viewport.h / 2)}px`
      el.style.width = `${Math.max(3, Math.round(r.w * zoom))}px`
      el.style.height = `${Math.max(3, Math.round(r.h * zoom))}px`
    }
    const move = (e: PointerEvent) => {
      if (!enabled || e.buttons !== 0 || isMapControl(e.target)) return hide()
      const bounds = container.getBoundingClientRect()
      const at = screenToMap(
        cameraRef.current,
        { x: e.clientX - bounds.left, y: e.clientY - bounds.top },
        viewport,
      )
      const { people: pmap, buildings: bmap, animals: list, ox: x0, oy: y0 } = latest.current
      const personId = pickPersonAt(at.x, at.y)
      if (personId) {
        const org = pmap.get(personId)
        if (org) return show(personRect(org, x0, y0))
      }
      const buildingId = pickBuildingAt(at.x, at.y)
      if (buildingId !== undefined && buildingId >= 0) {
        const b = bmap.get(buildingId)
        if (b) return show(buildingRect(b, x0, y0))
      }
      const animal = nearestAnimal(list ?? [], at.x, at.y, x0, y0)
      if (animal) return show(animalRect(animal, x0, y0))
      hide()
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

  return (
    <div
      ref={box}
      aria-hidden="true"
      style={{
        display: 'none',
        position: 'absolute',
        zIndex: 14,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '1px solid #ffe9a8',
        boxShadow: '0 0 0 1px rgba(17, 12, 8, 0.85)',
      }}
    />
  )
}
