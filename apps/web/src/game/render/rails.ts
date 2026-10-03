import { lineageEraTiers } from './draw-helpers'

import type { WorldState } from '../../shared/types'

import {
  drawLaunch,
  drawPlane,
  flightPosition,
  launchProgress,
  railLinks,
  type RailLink,
} from './era-traffic'

import { TILE } from '../model/palette'

export let _railSource: WorldState['buildings'] | undefined
export let _rails: RailLink[] = []
/** Rail links only change when the building list does. */
export function cachedRailLinks(buildings: WorldState['buildings']): RailLink[] {
  if (buildings !== _railSource) {
    _railSource = buildings
    _rails = railLinks(
      (buildings ?? []).map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        fw: b.fw,
        fh: b.fh,
        ruined: b.ruined,
        owner: b.owner_lineage ?? b.lineage_id ?? undefined,
      })),
    )
  }
  return _rails
}

/** Rockets lifting off from spaceports and aircraft over modern tribes. */
export function drawEraTraffic(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  ox: number,
  oy: number,
  W: number,
  H: number,
  cameraZoom: number,
  t: number,
) {
  for (const b of world.buildings ?? []) {
    if (b.kind !== 'Spaceport' || b.ruined || (b.construction_progress ?? b.condition ?? 1) < 1) continue
    const p = launchProgress(b.id, world.tick)
    if (p === null) continue
    const fw = b.fw ?? 3
    const fh = b.fh ?? 3
    const x = (b.x - ox + fw * 0.6) * TILE
    const y = (b.y - oy + fh) * TILE - 3
    if (x < -40 || x > W + 40 || y < -320 || y > H + 40) continue
    drawLaunch(ctx, x, y, p, t)
  }
  const settlements = world.settlements ?? []
  if (settlements.length === 0) return
  const tiers = lineageEraTiers(world.lineage_eras)
  const biggest = new Map<string, { x: number; y: number; pop: number }>()
  for (const s of settlements) {
    if (!s.lineage_id || (tiers.get(s.lineage_id) ?? 0) < 6) continue
    const prev = biggest.get(s.lineage_id)
    const pop = s.population ?? 0
    if (!prev || pop > prev.pop) biggest.set(s.lineage_id, { x: s.center[0], y: s.center[1], pop })
  }
  const scale = Math.max(1, 1.2 / Math.max(0.05, cameraZoom))
  for (const [lineage, centre] of biggest) {
    const f = flightPosition(lineage, centre, world.tick)
    if (!f) continue
    const x = (f.x - ox) * TILE
    const y = (f.y - oy) * TILE - 18
    if (x < -80 || x > W + 80 || y < -80 || y > H + 80) continue
    drawPlane(ctx, x, y, f.angle, scale)
  }
}
