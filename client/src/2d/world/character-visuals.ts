export const HUMAN_ATLAS_CELL = 32
export const HUMAN_ATLAS_FRAMES = 4
export const HUMAN_APPEARANCES = 3

export const HUMAN_STAGE_ORDER = ['infant', 'child', 'teen', 'adult', 'elder'] as const
export const HUMAN_SEX_ORDER = ['male', 'female'] as const

export type AgeStage = (typeof HUMAN_STAGE_ORDER)[number]
export type HumanSex = (typeof HUMAN_SEX_ORDER)[number]
export type CharacterDetailLevel = 'overview' | 'standard' | 'detail'

export const HUMAN_ATLAS_COLS = HUMAN_ATLAS_FRAMES
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

export function deterministicAppearanceIndex(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % HUMAN_APPEARANCES
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
