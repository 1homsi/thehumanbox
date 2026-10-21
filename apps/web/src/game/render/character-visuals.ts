export const HUMAN_ATLAS_CELL = 32
export const HUMAN_ATLAS_FRAMES = 4
/** Six authored skin, hair and clothing combinations; no hue rotations. */
export const HUMAN_SHEET_APPEARANCES = 6
export const HUMAN_APPEARANCES = HUMAN_SHEET_APPEARANCES
export const HUMAN_CLOTHING_ERAS = ['hide', 'robe', 'coat', 'uniform', 'spacesuit'] as const
export const HUMAN_DIRECTIONS = 2
/** The padded cell keeps room scenes compatible. Art is drawn at one world pixel per source pixel. */
export const HUMAN_FEET_ROW = 25
export const HUMAN_HEIGHT = { infant: 6, child: 10, teen: 14, adult: 16, elder: 14 } as const
/** The row of the hands, counted down from the top of the figure: where a held tool sits. */
export const HUMAN_HAND_ROW = { infant: 3, child: 6, teen: 9, adult: 10, elder: 9 } as const

/**
 * The middle of a person's sprite as the people layer draws it, from their position in map pixels. The cell
 * snaps to whole pixels, so anything that follows a person (their name, a glyph) must snap the same way or it
 * wobbles a pixel against them as they walk.
 */
export function figureCentreX(px: number): number {
  return Math.round(px - HUMAN_ATLAS_CELL / 2) + HUMAN_ATLAS_CELL / 2
}

/** The top of a person's head as drawn: their feet stand on the snapped position. */
export function figureHeadTop(py: number, stage: keyof typeof HUMAN_HEIGHT): number {
  return Math.round(py - HUMAN_FEET_ROW) + HUMAN_FEET_ROW - HUMAN_HEIGHT[stage]
}

/** Names from the same lineage-era data used by buildings. Unnamed tribes start in hides. */
export function humanClothingEra(era: string | undefined): number {
  switch (era) {
    case undefined:
    case '':
    case 'pre-stone':
    case 'pre_stone':
    case 'stone':
    case 'bronze':
    case 'iron':
      return 0
    case 'classical':
    case 'medieval':
    case 'renaissance':
      return 1
    case 'industrial':
      return 2
    case 'modern':
    case 'atomic':
    case 'information':
      return 3
    default:
      return 4
  }
}

/** Era and facing are column banks, so the sheet stays below GPU texture-height limits. */
export function humanAtlasColumn(era: string | undefined, flipped = false): number {
  return humanClothingEra(era) * HUMAN_DIRECTIONS * HUMAN_ATLAS_FRAMES + (flipped ? HUMAN_ATLAS_FRAMES : 0)
}

export const HUMAN_STAGE_ORDER = ['infant', 'child', 'teen', 'adult', 'elder'] as const
export const HUMAN_SEX_ORDER = ['male', 'female'] as const

export type AgeStage = (typeof HUMAN_STAGE_ORDER)[number]
export type HumanSex = (typeof HUMAN_SEX_ORDER)[number]
export type CharacterDetailLevel = 'overview' | 'standard' | 'detail'

export const HUMAN_ATLAS_COLS = HUMAN_ATLAS_FRAMES * HUMAN_DIRECTIONS * HUMAN_CLOTHING_ERAS.length
export const HUMAN_ATLAS_ROWS = HUMAN_STAGE_ORDER.length * HUMAN_SEX_ORDER.length * HUMAN_APPEARANCES
export const HUMAN_ATLAS_WIDTH = HUMAN_ATLAS_COLS * HUMAN_ATLAS_CELL
export const HUMAN_ATLAS_HEIGHT = HUMAN_ATLAS_ROWS * HUMAN_ATLAS_CELL

const validStages = new Set<string>(HUMAN_STAGE_ORDER)

export interface CharacterAge {
  age_stage?: string
  age?: number
  max_age?: number
  /** Social/lineage role in the simulation; intentionally not an age signal. */
  is_elder?: boolean
}

export function resolveAgeStage(character: CharacterAge): AgeStage {
  if (character.age_stage && validStages.has(character.age_stage)) {
    return character.age_stage as AgeStage
  }

  const age = character.age
  const maxAge = character.max_age
  if (!Number.isFinite(age) || !Number.isFinite(maxAge) || maxAge === undefined || maxAge <= 0) {
    return 'adult'
  }

  const fraction = Math.max(0, age ?? 0) / maxAge
  if (fraction < 0.1) return 'infant'
  if (fraction < 0.25) return 'child'
  if (fraction < 0.35) return 'teen'
  if (fraction < 0.75) return 'adult'
  return 'elder'
}

const appearanceCache = new Map<string, number>()
export function deterministicAppearanceIndex(id: string): number {
  const cached = appearanceCache.get(id)
  if (cached !== undefined) return cached
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const index = (hash >>> 0) % HUMAN_APPEARANCES
  if (appearanceCache.size >= 20000) appearanceCache.clear()
  appearanceCache.set(id, index)
  return index
}

export function wrapHumanFrame(frame: number): number {
  if (!Number.isFinite(frame)) return 0
  const integerFrame = Math.floor(frame)
  return ((integerFrame % HUMAN_ATLAS_FRAMES) + HUMAN_ATLAS_FRAMES) % HUMAN_ATLAS_FRAMES
}

export function humanAtlasRow(sex: HumanSex, stage: AgeStage, appearance: number): number {
  const sexIndex = HUMAN_SEX_ORDER.indexOf(sex)
  const stageIndex = HUMAN_STAGE_ORDER.indexOf(stage)
  const appearanceIndex =
    ((Math.floor(appearance) % HUMAN_APPEARANCES) + HUMAN_APPEARANCES) % HUMAN_APPEARANCES
  return (
    sexIndex * HUMAN_STAGE_ORDER.length * HUMAN_APPEARANCES + stageIndex * HUMAN_APPEARANCES + appearanceIndex
  )
}

export function zoomDetailLevel(zoom: number): CharacterDetailLevel {
  if (!Number.isFinite(zoom)) return 'standard'
  if (zoom < 0.8) return 'overview'
  if (zoom >= 2.2) return 'detail'
  return 'standard'
}

export interface CharacterMotion {
  x: number
  y: number
  movedAt: number
  phase: number
  flipped: boolean
  distance: number
}

export function characterMotion(
  previous: CharacterMotion | undefined,
  x: number,
  y: number,
  now: number,
  phase: number,
): CharacterMotion {
  const dx = x - (previous?.x ?? x)
  const dy = y - (previous?.y ?? y)
  const moved = Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02
  const distance = Math.hypot(dx, dy)
  // Large jumps are placements, not steps.
  return {
    distance: (previous?.distance ?? 0) + (moved && distance < 4 ? distance : 0),
    x: moved || !previous ? x : previous.x,
    y: moved || !previous ? y : previous.y,
    movedAt: moved ? now : (previous?.movedAt ?? -Infinity),
    phase: previous?.phase ?? phase,
    // Only turn on mostly sideways steps: someone walking up or down with a
    // slight horizontal wobble used to flip left and right every frame.
    flipped:
      Math.abs(dx) > 0.02 && Math.abs(dx) >= Math.abs(dy) * 0.5 ? dx < 0 : (previous?.flipped ?? false),
  }
}

export function characterFrame(motion: CharacterMotion, now: number): number {
  return now - motion.movedAt > 120
    ? 0
    : Math.floor(motion.distance * 4 + motion.phase / 200) % HUMAN_ATLAS_FRAMES
}

export function compareCharacterDepth(a: { y: number; id: string }, b: { y: number; id: string }): number {
  return a.y - b.y || a.id.localeCompare(b.id)
}
