import { useEffect, useRef, type MutableRefObject } from 'react'
import type { WorldState } from '../../shared/types'
import { famineStages, type FamineStage } from '../model/famine-warning'
import { tribeHome } from '../model/tribe-peril'
import type { MapCamera, MapSize } from './camera-controls'
import { tileOnScreen } from './map-screen'
import './famine-tint.css'
import {
  mergeTintSpots,
  TINT_MERGE_DISTANCE,
  TINT_SIZE,
  tintGrowth,
  type TintGroup,
} from './famine-tint-merge'

/** A tint this far outside the view is not placed on screen at all. */
const EDGE_PAD = 80
interface Tint {
  lineage: string
  stage: Exclude<FamineStage, 'gone'>
  home: { x: number; y: number }
}

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
}

/**
 * A soft tint over every tribe that is at risk of famine or losing people, at the middle of its home. Amber
 * for a tribe at risk, red for one losing people. The tints follow the camera on each animation frame; a tribe
 * that has died out has no tint (its grave mark stands in for it).
 */
export function FamineTints({ world, cameraRef, viewport }: Props) {
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const tints: Tint[] = []
  for (const [lineage, stage] of famineStages(world)) {
    if (stage === 'gone') continue
    const home = tribeHome(world, lineage)
    if (home) tints.push({ lineage, stage, home })
  }
  const boxes = useRef(new Map<string, HTMLDivElement>())
  const latest = useRef({ tints, ox, oy, viewport })
  latest.current = { tints, ox, oy, viewport }

  useEffect(() => {
    let frame = 0
    const place = () => {
      const { tints: now, ox: x0, oy: y0, viewport: view } = latest.current
      const spots = now.map((tint) => {
        const p = tileOnScreen([tint.home.x, tint.home.y], { x: x0, y: y0 }, cameraRef.current, view)
        return { x: p.x, y: p.y, severity: tint.stage === 'losing' ? 2 : 1 }
      })
      const shownAt = new Map<number, TintGroup>()
      for (const group of mergeTintSpots(spots, TINT_MERGE_DISTANCE)) shownAt.set(group.lead, group)
      now.forEach((tint, i) => {
        const el = boxes.current.get(tint.lineage)
        if (!el) return
        const group = shownAt.get(i)
        const shown =
          group !== undefined &&
          group.x >= -EDGE_PAD &&
          group.x <= view.w + EDGE_PAD &&
          group.y >= -EDGE_PAD &&
          group.y <= view.h + EDGE_PAD
        el.style.display = shown ? '' : 'none'
        if (!group || !shown) return
        const size = `${Math.round(TINT_SIZE * tintGrowth(group.count))}px`
        el.style.left = `${group.x}px`
        el.style.top = `${group.y}px`
        el.style.width = size
        el.style.height = size
      })
      frame = requestAnimationFrame(place)
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [cameraRef])

  return (
    <>
      {tints.map((tint) => (
        <div
          key={tint.lineage}
          ref={(el) => {
            if (el) boxes.current.set(tint.lineage, el)
            else boxes.current.delete(tint.lineage)
          }}
          className={`famine-tint famine-tint-${tint.stage}`}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      ))}
    </>
  )
}
