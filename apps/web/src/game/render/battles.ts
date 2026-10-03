// Battles between tribes, drawn where they are fought: a churn of dust and
// steel, each side's banner, and the dead counted on the field. War was the
// world's biggest killer and the only sign of it on the map was its people
// walking off and not coming back.

import type { BattleInfo } from '../../shared/types'

type Ctx = CanvasRenderingContext2D

/** How far a battle's dust reaches, in tiles, by its scale. */
export function battleRadius(scale: string): number {
  const s = scale.toLowerCase()
  if (s.includes('war') || s.includes('siege')) return 5
  if (s.includes('battle')) return 3.5
  return 2.5
}

/** Ticks a battlefield shows its dead after the fighting stops. */
export const AFTERMATH_TICKS = 900

/** Battles still being fought. */
export function activeBattles(battles: readonly BattleInfo[] | undefined): BattleInfo[] {
  return (battles ?? []).filter((b) => !b.ended)
}

/**
 * How far past its end a battle is: 0 while it is fought, rising to 1 as its
 * field clears. Null once the field has cleared, or for an old snapshot's
 * ended battle that never said when it ended.
 */
export function battleAge(battle: BattleInfo, tick: number): number | null {
  if (!battle.ended) return 0
  if (battle.ended_tick == null) return null
  const since = tick - battle.ended_tick
  return since >= 0 && since < AFTERMATH_TICKS ? since / AFTERMATH_TICKS : null
}

/** The lineages a tribe is fighting, from the battles still being fought. */
export function enemiesOf(battles: readonly BattleInfo[] | undefined, lineage: string): string[] {
  const out = new Set<string>()
  for (const b of activeBattles(battles)) {
    if (b.attackers.includes(lineage)) b.defenders.forEach((d) => out.add(d))
    if (b.defenders.includes(lineage)) b.attackers.forEach((a) => out.add(a))
  }
  out.delete(lineage)
  return [...out].sort()
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  return (Math.imul(h, 0xc2b2ae35) >>> 0) / 4294967296
}

function banner(ctx: Ctx, x: number, y: number, color: string, unit: number, flutter: number) {
  ctx.fillStyle = '#3a2a1c'
  ctx.fillRect(x, y - unit * 9, unit, unit * 9)
  ctx.fillStyle = color
  ctx.fillRect(x + unit, y - unit * 9, unit * 4, unit * 3)
  ctx.fillRect(x + unit * 4, y - unit * 8 + flutter * unit, unit * 2, unit * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(x + unit, y - unit * 7, unit * 4, unit)
}

/**
 * One battle at (cx, cy) in map pixels. `tile` is the map's tile size and
 * `scale` keeps the marks readable when the camera is far out.
 */
export function drawBattle(
  ctx: Ctx,
  battle: BattleInfo,
  cx: number,
  cy: number,
  tile: number,
  scale: number,
  colorA: string,
  colorB: string,
  t: number,
  age = 0,
) {
  const r = battleRadius(battle.scale) * tile
  const unit = Math.max(1, Math.round(tile / 8)) * scale
  const seed = battle.started_tick
  ctx.save()
  const over = battle.ended
  if (over) ctx.globalAlpha = 1 - age * 0.85

  // Trampled, churned ground under the fighting.
  ctx.fillStyle = 'rgba(92, 70, 46, 0.28)'
  ctx.beginPath()
  ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Once it is over the field falls still: the fallen lie where they fell.
  if (over) {
    const fallen = Math.min(12, battle.casualties_a + battle.casualties_d)
    for (let i = 0; i < fallen; i++) {
      const fx = cx + (hash(seed + i * 41) - 0.5) * r * 1.4
      const fy = cy + (hash(seed + i * 43) - 0.5) * r * 0.8
      ctx.fillStyle = i < battle.casualties_a ? colorA : colorB
      ctx.fillRect(Math.round(fx), Math.round(fy), unit * 3, unit)
      ctx.fillStyle = 'rgba(30,20,14,0.6)'
      ctx.fillRect(Math.round(fx), Math.round(fy) + unit, unit * 3, unit)
    }
  }

  // Dust rolling over the field.
  for (let i = 0; i < (over ? 0 : 14); i++) {
    const a = hash(seed + i) * Math.PI * 2 + t * 0.0004 * (i % 2 ? 1 : -1)
    const d = r * (0.3 + hash(seed + i * 7) * 0.7)
    const puff = (0.4 + hash(seed + i * 13) * 0.6) * tile * (1 + 0.15 * Math.sin(t * 0.003 + i))
    ctx.fillStyle = `rgba(196, 170, 128, ${0.16 + 0.08 * Math.sin(t * 0.002 + i)})`
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, puff, 0, Math.PI * 2)
    ctx.fill()
  }

  // Steel catching the light where the lines meet.
  for (let i = 0; i < (over ? 0 : 8); i++) {
    const phase = Math.floor(t / 90 + hash(seed + i * 3) * 10)
    if (hash(phase * 31 + i) < 0.55) continue
    const sx = cx + (hash(phase + i * 17) - 0.5) * r * 1.2
    const sy = cy + (hash(phase + i * 23) - 0.5) * r * 0.7
    ctx.fillStyle = i % 2 ? '#fff4c2' : '#ffd34d'
    ctx.fillRect(Math.round(sx), Math.round(sy), unit, unit)
    ctx.fillRect(Math.round(sx - unit), Math.round(sy + unit), unit, unit)
  }

  // Each side's banner on its own flank.
  const flutter = Math.floor(t / 160) % 2
  banner(ctx, cx - r * 0.9, cy + unit * 2, colorA, unit, flutter)
  banner(ctx, cx + r * 0.9 - unit * 6, cy + unit * 2, colorB, unit, 1 - flutter)

  // A plaque over the field: crossed swords, what kind of fight, its dead.
  drawBattlePlaque(ctx, battle, cx, cy - r * 0.6, scale, over)
  ctx.restore()
}

/** "raid", "battle", "war": how the plaque names the fight. */
export function fightName(scale: string): string {
  const s = scale.toLowerCase()
  if (s.includes('siege')) return 'siege'
  if (s.includes('war')) return 'war'
  if (s.includes('raid')) return 'raid'
  if (s.includes('skirmish')) return 'skirmish'
  return 'battle'
}

/** The plaque's words: "raid · 7 fallen", or "raid" before anyone falls. */
export function plaqueText(battle: BattleInfo): string {
  const fallen = battle.casualties_a + battle.casualties_d
  const name = fightName(battle.scale)
  return fallen > 0 ? `${name} · ${fallen} fallen` : name
}

function drawBattlePlaque(
  ctx: Ctx,
  battle: BattleInfo,
  cx: number,
  bottom: number,
  scale: number,
  over: boolean,
) {
  const text = plaqueText(battle)
  ctx.font = `bold ${(9 * scale).toFixed(2)}px monospace`
  const textW = ctx.measureText(text).width
  const icon = 11 * scale
  const pad = 4 * scale
  const w = icon + textW + pad * 3
  const h = 13 * scale
  const left = cx - w / 2
  const top = bottom - h
  ctx.fillStyle = 'rgba(22,17,11,0.78)'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = over ? 'rgba(170,150,130,0.7)' : 'rgba(255,110,90,0.9)'
  ctx.fillRect(left, top, w, Math.max(0.5, scale))

  // Crossed swords, pixel by pixel.
  const u = scale
  const ix = left + pad
  const iy = top + (h - icon) / 2
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = '#e8ecef'
    ctx.fillRect(ix + i * u, iy + i * u, u, u)
    ctx.fillRect(ix + (8 - i) * u, iy + i * u, u, u)
  }
  ctx.fillStyle = '#c9a043'
  ctx.fillRect(ix, iy + 8 * u, u * 2, u * 2)
  ctx.fillRect(ix + 7 * u, iy + 8 * u, u * 2, u * 2)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = over ? '#d8c8b0' : '#ffb3a3'
  ctx.fillText(text, ix + icon + pad, top + h / 2 + 0.5 * scale)
}
