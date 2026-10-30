import { useEffect, useRef, type MutableRefObject } from 'react'
import type { WorldState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { knownTribeName } from '../../state/worldStore'
import { useUIStore } from '../../state/store'
import { t } from '../../i18n'
import { calendarAt } from '../model/calendar'
import { causeText, fallenTribes, type FallenTribe } from '../model/tribe-end'
import type { MapCamera, MapSize } from './camera-controls'
import { markerScreenPoint } from './fallen-marker-position'
import './world-map.css'

/** A marker this far outside the view is not placed on screen at all. */
const EDGE_PAD = 24

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
}

/**
 * A small grave mark on the map where each fallen tribe's last member died. Hover names the tribe, the year
 * and the recorded cause; a click opens that tribe's card. The marks follow the camera on each animation frame
 * and are only moved in place, so they cost nothing per world frame beyond the list of fallen tribes.
 */
export function FallenMarkers({ world, cameraRef, viewport }: Props) {
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const marked = fallenTribes(world).filter((f): f is FallenTribe & { place: [number, number] } => !!f.place)
  const boxes = useRef(new Map<string, HTMLButtonElement>())
  const latest = useRef({ marked, ox, oy, viewport })
  latest.current = { marked, ox, oy, viewport }

  useEffect(() => {
    let frame = 0
    const place = () => {
      const { marked: now, ox: x0, oy: y0, viewport: view } = latest.current
      for (const f of now) {
        const el = boxes.current.get(f.lineage)
        if (!el) continue
        const p = markerScreenPoint(f.place, { x: x0, y: y0 }, cameraRef.current, view)
        const shown =
          p.x >= -EDGE_PAD && p.x <= view.w + EDGE_PAD && p.y >= -EDGE_PAD && p.y <= view.h + EDGE_PAD
        el.style.display = shown ? '' : 'none'
        el.style.left = `${p.x}px`
        el.style.top = `${p.y}px`
      }
      frame = requestAnimationFrame(place)
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [cameraRef])

  return (
    <>
      {marked.map((f) => {
        const name = knownTribeName(world.lineage_names, f.lineage) ?? f.lineage.slice(0, 6)
        const year = calendarAt(f.tick).year
        const title = f.cause
          ? t('panels.tribe.fallen.markerCause', { name, year, cause: causeText(f.cause) })
          : t('panels.tribe.fallen.marker', { name, year })
        return (
          <button
            key={f.lineage}
            ref={(el) => {
              if (el) boxes.current.set(f.lineage, el)
              else boxes.current.delete(f.lineage)
            }}
            className="fallen-marker"
            style={{ borderColor: lineageColor(f.lineage), display: 'none' }}
            title={title}
            aria-label={title}
            onClick={() => useUIStore.getState().setFocus(`lineage:${f.lineage}`)}
          >
            <span aria-hidden="true">✝</span>
          </button>
        )
      })}
    </>
  )
}
