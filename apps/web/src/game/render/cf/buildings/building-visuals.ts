import type { Building, WorldState } from '../../../../shared/types'
import { getBuildingState } from '../../../model/building-state'
import { TILE } from '../../../model/palette'
import { hasBuildingSprite } from '../../building-sprites'
import { PAD, PAD_BOT, PAD_TOP } from '../../building-painters/kit'
import { buildingDepthKey } from '../../building-draw/depth'
import { normKind, resolveBuildingFootprint } from '../../building-draw/footprints'
import { RUIN_CRUMBLE_TICKS } from '../../building-draw/ruins'
import type { BuildingLike, BuildingVisualDetail } from '../../building-draw/types'
import { padEmpty } from '../../era-traffic'
import { isHouseLike } from '../../building-draw/colors'

/** Everything about the frame that changes how a building looks. */
export interface BuildingFrameInfo {
  tick: number
  /** 0..3, from the day/night cycle (see draw_buildings). */
  nightBucket: number
  detail: BuildingVisualDetail
  tiers: ReadonlyMap<string, number>
  /** It is winter on the ground: house roofs carry snow. */
  winter: boolean
}

/** Construction progress and ruin age are quantised so a site does not bake a cell per tick. */
export const PROGRESS_STEPS = 48
export const RUIN_AGE_STEPS = 12
export const DAMAGE_STEPS = 32

const q = (v: number, steps: number) => Math.round(Math.max(0, Math.min(1, v)) * steps)

/** What a building bakes into the atlas: a stable key plus the record to paint. */
export interface BuildingVisual {
  key: string
  record: BuildingLike
  fw: number
  fh: number
  /** Night factor handed to the painter (an exact bucket centre). */
  night: number
  detail: BuildingVisualDetail
  /** World-space top-left of the content rectangle, relative to the building's own tile origin. */
  contentW: number
  contentH: number
}

export function contentSize(fw: number, fh: number): { w: number; h: number } {
  return { w: fw * TILE + PAD * 2, h: fh * TILE + PAD_TOP + PAD_BOT }
}

/**
 * The visual state of one building, mirroring `drawBuilding`'s branches: which
 * inputs reach pixels decides which go into the key. A finished, undamaged sprite
 * building depends only on kind, footprint, variant, tier, night and condition,
 * so a whole city shares a handful of cells; sites, ruins and damage also depend
 * on the building's own id and position (their details are hashed from them).
 */
export function describeBuilding(b: Building, info: BuildingFrameInfo): BuildingVisual {
  const [fw, fh] = resolveBuildingFootprint(b)
  const tier = info.tiers.get(b.owner_lineage ?? b.lineage_id ?? '') ?? 0
  const structural = getBuildingState(b)
  const k = normKind(b.kind)
  const ruinAge =
    b.ruined && b.ruined_at_tick != null
      ? Math.max(0, (info.tick - b.ruined_at_tick) / RUIN_CRUMBLE_TICKS)
      : 0
  const state = b.kind === 'Spaceport' && padEmpty(b.id, info.tick) ? 'empty' : undefined
  const snow = info.winter && isHouseLike(k)
  const base = `${b.kind}|${fw}x${fh}|t${tier}`
  const identity = `${b.id}@${b.x},${b.y}`
  const record: BuildingLike = {
    id: b.id,
    kind: b.kind,
    x: b.x,
    y: b.y,
    condition: b.condition,
    damage: b.damage,
    integrity: b.integrity,
    ruined: b.ruined,
    repairing: b.repairing,
    footprint: b.footprint,
    fw: b.fw,
    fh: b.fh,
    tier,
    ruinAge,
    state,
    snow,
  }
  const { w: contentW, h: contentH } = contentSize(fw, fh)
  const out = (key: string, night: number, detail: BuildingVisualDetail): BuildingVisual => ({
    key,
    record,
    fw,
    fh,
    night,
    detail,
    contentW,
    contentH,
  })

  if (structural.isRuined) {
    const age = q(ruinAge, RUIN_AGE_STEPS)
    record.ruinAge = age / RUIN_AGE_STEPS
    const integrity = q(structural.integrity, PROGRESS_STEPS)
    record.integrity = integrity / PROGRESS_STEPS
    return out(
      `R|${base}|${identity}|a${age}|i${integrity}|r${structural.isRepairing ? 1 : 0}|${info.detail}`,
      0,
      info.detail,
    )
  }
  if (!structural.isComplete) {
    const progress = q(structural.constructionProgress, PROGRESS_STEPS)
    record.condition = progress / PROGRESS_STEPS
    return out(`C|${base}|${identity}|p${progress}|${info.detail}`, 0, info.detail)
  }

  const variant = ((((b.id ?? 0) * 2654435761) ^ (b.x * 73856093) ^ (b.y * 19349663)) >>> 0) & 7
  const sprite = hasBuildingSprite(k)
  const damaged = structural.isDamaged
  const night = sprite ? info.nightBucket : 0
  const cond = structural.integrity < 0.45 ? 0 : 1
  // Snow changes the sprite (only on sprites that paint a roof), so it joins every sprite key.
  const snowKey = sprite ? `|w${snow ? 1 : 0}` : ''
  if (!damaged) {
    // The emoji fallback does not look at the variant or the night.
    return out(
      sprite ? `S|${base}|v${variant}|n${night}|c${cond}|s${state ?? ''}${snowKey}` : `E|${base}`,
      night / 3,
      info.detail,
    )
  }
  const severity = q(Math.max(structural.damage, 1 - structural.integrity), DAMAGE_STEPS)
  const integrity = q(structural.integrity, DAMAGE_STEPS)
  record.damage = Math.min(1, severity / DAMAGE_STEPS)
  record.integrity = integrity / DAMAGE_STEPS
  return out(
    `D|${base}|${identity}|v${variant}|n${night}|c${cond}|s${state ?? ''}|d${severity}|i${integrity}|r${structural.isRepairing ? 1 : 0}${snowKey}|${info.detail}`,
    night / 3,
    info.detail,
  )
}

/** World-space pixel position of the content rectangle's top-left for a building. */
export function contentOrigin(
  b: Pick<Building, 'x' | 'y'>,
  ox: number,
  oy: number,
): { x: number; y: number } {
  return { x: Math.round((b.x - ox) * TILE) - PAD, y: Math.round((b.y - oy) * TILE) - PAD_TOP }
}

/** 0..3 night bucket the building painters bake (see draw_buildings). */
export function nightBucketOf(world: Pick<WorldState, 'is_day' | 'day_progress'>): number {
  const dp = world.day_progress ?? 0.5
  const night = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(dp - 0.5) * 2))
  return Math.max(0, Math.min(3, Math.round(night * 3)))
}

/** Painter's order: bottom edge first, then left edge (float32 keeps ~1/1000 tile of precision up to y=300). */
export function buildingSortKey(b: Building): number {
  return buildingDepthKey(b) + Math.max(0, Math.min(1023, Number.isFinite(b.x) ? b.x : 0)) / 1024
}
