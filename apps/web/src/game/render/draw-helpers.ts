import type { AnimalState, OrganismState } from '../../shared/types'

import { cbFireRgba } from '../../shared/constants'

import { eraTier } from '../model/era-tier'

import { characterMotion, type CharacterMotion } from './character-visuals'

/** Each tribe's architectural tier, from the era it has reached. */
export function lineageEraTiers(
  eras: Array<{ lineage_id: string; era_name: string }> | Record<string, string> | undefined,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!eras) return out
  if (Array.isArray(eras)) for (const e of eras) out.set(e.lineage_id, eraTier(e.era_name))
  else for (const [id, era] of Object.entries(eras)) out.set(id, eraTier(era))
  return out
}

/**
 * Drawn sizes for summoned monsters. Zombies, demons and aliens are drawn
 * at one pixel per sprite pixel, the size of a person; the dragon and the
 * UFO are drawn double and dwarf everything else.
 */
export const MONSTER_SIZES: Record<string, number> = { zombie: 10, demon: 12, dragon: 32, alien: 8, ufo: 26 }

export const _orgLastPos = new Map<string, CharacterMotion>()
export const _animalLastPos = new Map<number, CharacterMotion>()
const animPhaseCache = new Map<string, number>()
export function orgAnimPhase(id: string): number {
  const cached = animPhaseCache.get(id)
  if (cached !== undefined) return cached
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const phase = h % 800
  if (animPhaseCache.size >= 20000) animPhaseCache.clear()
  animPhaseCache.set(id, phase)
  return phase
}
export function orgMotion(id: string, x: number, y: number, now: number): CharacterMotion {
  const motion = characterMotion(_orgLastPos.get(id), x, y, now, orgAnimPhase(id))
  _orgLastPos.set(id, motion)
  return motion
}

export interface OrgInterpCache {
  source: OrganismState[] | null
  prevSource: OrganismState[] | null
  frameId: number
  items: OrganismState[]
  prevById: Map<string, OrganismState>
}

export interface AnimalInterpCache {
  source: AnimalState[] | null
  prevSource: AnimalState[] | null
  frameId: number
  items: AnimalState[]
  prevById: Map<number, AnimalState>
}

export const ERA_STRIPE_COLOR: Record<string, string> = {
  bronze: '#b07a2a',
  iron: '#7a7a7a',
  classical: '#d4a04a',
  medieval: '#5a4030',
  renaissance: '#c08850',
  industrial: '#3e2e22',
  modern: '#9aa0a8',
  information: '#7cc6ff',
}

export function pickToolEmoji(tools: Record<string, number> | undefined): string {
  if (!tools) return ''
  if (tools.rifle || tools.musket) return '\u{1F52B}'
  if (tools.iron_sword) return '\u{2694}\u{FE0F}'
  if (tools.bronze_spear || tools.stone_spear) return '\u{1F3F9}'
  if (tools.bow || tools.crossbow) return '\u{1F3F9}'
  if (tools.computer) return '\u{1F4BB}'
  if (tools.book) return '\u{1F4D6}'
  if (tools.hammer || tools.saw) return '\u{1F528}'
  if (tools.plow) return '\u{1F69C}'
  return ''
}

export const SPECIALTY_EMOJI: Record<string, string> = {
  farmer: '\u{1F33E}',
  smith: '\u{1F528}',
  hunter: '\u{1F3F9}',
  healer: '\u{2695}\u{FE0F}',
  scholar: '\u{1F4DC}',
  merchant: '\u{1F4B0}',
  soldier: '\u{2694}\u{FE0F}',
  builder: '\u{1F3D7}\u{FE0F}',
  priest: '\u{1F4FF}',
  artist: '\u{1F3A8}',
  engineer: '\u{2699}\u{FE0F}',
  sailor: '\u{26F5}',
  miner: '\u{26CF}\u{FE0F}',
  weaver: '\u{1F9F5}',
  baker: '\u{1F35E}',
  brewer: '\u{1F37A}',
  carpenter: '\u{1FA9C}',
  mason: '\u{1F9F1}',
  scribe: '\u{270D}\u{FE0F}',
  banker: '\u{1F3E6}',
  doctor: '\u{1F489}',
  teacher: '\u{1F4DA}',
  lawyer: '\u{2696}\u{FE0F}',
  officer: '\u{1F46E}',
  pilot: '\u{2708}\u{FE0F}',
  programmer: '\u{1F4BB}',
  journalist: '\u{1F4F0}',
  actor: '\u{1F3AD}',
  athlete: '\u{1F3C5}',
  politician: '\u{1F3DB}\u{FE0F}',
}

export function drawCanineSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: 'wolf' | 'dog',
  flipped: boolean,
  step: number,
) {
  const unit = Math.max(1, Math.floor(size / 14))
  const spriteWidth = 14 * unit
  const spriteHeight = 14 * unit
  const left = Math.round(cx - spriteWidth / 2)
  const top = Math.round(cy - spriteHeight / 2)
  const outline = '#261d20'
  const fur = kind === 'wolf' ? '#677483' : '#a8643f'
  const highlight = kind === 'wolf' ? '#a8b3bc' : '#d49a66'
  const dark = kind === 'wolf' ? '#3d4854' : '#6f3c2b'
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x * unit, y * unit, width * unit, height * unit)
  }

  ctx.save()
  ctx.translate(flipped ? left + spriteWidth : left, top)
  if (flipped) ctx.scale(-1, 1)

  // Tail, body and head share an outline so both animals read clearly
  // against grass, sand and snow at the world camera scale.
  rect(0, 4, 4, 3, outline)
  rect(1, 4, 3, 1, fur)
  rect(2, 5, 2, 1, highlight)
  rect(3, 4, 8, 6, outline)
  rect(4, 5, 6, 4, fur)
  rect(4, 8, 6, 1, dark)
  rect(9, 2, 5, 7, outline)
  rect(10, 3, 3, 5, fur)
  rect(9, 0, 2, 3, outline)
  rect(12, 1, 2, 3, outline)
  rect(10, 1, 1, 2, dark)
  rect(12, 2, 1, 2, dark)
  rect(12, 5, 2, 2, highlight)
  rect(13, 5, 1, 1, '#171317')
  rect(11, 4, 1, 1, '#f1d37b')

  const frontFoot = step % 2 === 0 ? 0 : 1
  const backFoot = step % 2 === 0 ? 1 : 0
  rect(4, 9, 2, 4, outline)
  rect(5, 9, 1, 3, fur)
  rect(4 - backFoot, 12, 3, 1, outline)
  rect(8, 9, 2, 4, outline)
  rect(9, 9, 1, 3, fur)
  rect(8 + frontFoot, 12, 3, 1, outline)

  if (kind === 'dog') {
    rect(9, 6, 4, 1, '#e95b55')
    rect(10, 7, 1, 1, '#f2c84b')
  }
  ctx.restore()
}

export function visualTileHash(col: number, row: number, salt = 0): number {
  let hash = (col * 374761393 + row * 668265263 + salt * 1274126177) | 0
  hash = ((hash ^ (hash >>> 13)) * 1274126177) | 0
  return hash >>> 0
}

export function drawFoodPatch(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  // Keep every resource tile legible without carpeting the whole landscape
  // with identical dark bushes. Larger shrubs punctuate smaller forage plants.
  const x = px + 2 + ((seed >>> 5) & 3)
  const y = py + 2 + ((seed >>> 9) & 3)
  const large = (seed & 7) === 0
  ctx.fillStyle = '#536a3b'
  ctx.fillRect(x, y + 1, large ? 4 : 2, large ? 3 : 2)
  ctx.fillStyle = '#81924d'
  ctx.fillRect(x + 1, y, large ? 3 : 1, large ? 2 : 1)
  ctx.fillStyle = (seed & 1) === 0 ? '#b46e52' : '#b6a35c'
  ctx.fillRect(x + 1, y + 1, 1, 1)
}

export function drawMineralOutcrop(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  ctx.fillStyle = '#3d3937'
  ctx.fillRect(px + 1, py + 5, 7, 2)
  ctx.fillRect(px + 2, py + 3, 5, 3)
  ctx.fillRect(px + 4, py + 2, 3, 2)
  ctx.fillStyle = '#716a62'
  ctx.fillRect(px + 3, py + 3, 2, 1)
  ctx.fillRect(px + 5, py + 4, 2, 1)
  ctx.fillStyle = (seed & 1) === 0 ? '#e2b84d' : '#7fc9c7'
  ctx.fillRect(px + 5, py + 3, 1, 1)
  ctx.fillRect(px + 3, py + 5, 1, 1)
}

export function drawPixelFire(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  intensity: number,
  frame: number,
  campfire: boolean,
) {
  const strength = Math.max(0.2, Math.min(1, intensity))
  const shift = frame & 1
  if (campfire) {
    ctx.fillStyle = '#3b2418'
    ctx.fillRect(px + 1, py + 6, 6, 2)
    ctx.fillStyle = '#82502a'
    ctx.fillRect(px + 2, py + 6, 2, 1)
    ctx.fillRect(px + 5, py + 7, 2, 1)
  } else {
    ctx.fillStyle = 'rgba(62,35,24,0.75)'
    ctx.fillRect(px + 1, py + 7, 6, 1)
  }

  ctx.fillStyle = cbFireRgba(204, 54, 16, 0.8 * strength)
  ctx.fillRect(px + 2, py + 3 + shift, 5, 4 - shift)
  ctx.fillStyle = cbFireRgba(255, 126, 24, 0.95 * strength)
  ctx.fillRect(px + 3 + shift, py + 2, 3, 4)
  ctx.fillStyle = cbFireRgba(255, 222, 92, strength)
  ctx.fillRect(px + 4, py + 3 - shift, 1, 3)
  if (strength > 0.55) {
    ctx.fillStyle = cbFireRgba(255, 164, 48, 0.75 * strength)
    ctx.fillRect(px + ((frame + 1) % 6), py + 1, 1, 1)
  }
}
