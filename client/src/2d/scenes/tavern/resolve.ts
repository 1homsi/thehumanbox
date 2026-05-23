import type { SceneContext, SceneFixture, SceneId, SceneOccupant } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'

export const TAVERN_RADIUS = 18

function findTavernAnchor(world: WorldState, lineageId: string): { x: number; y: number } | null {
  const buildings = world.buildings ?? []
  let best: { x: number; y: number; score: number } | null = null
  for (const b of buildings) {
    if (b.kind !== 'tavern') continue
    const owner = (b as { lineage_id?: string }).lineage_id
    if (owner && owner !== lineageId) continue
    const score = b.condition ?? 1
    if (!best || score > best.score) best = { x: b.x, y: b.y, score }
  }
  if (best) return best

  let cx = 0
  let cy = 0
  let n = 0
  for (const o of world.organisms) {
    if (!o.alive || o.lineage_id !== lineageId) continue
    cx += o.x
    cy += o.y
    n++
  }
  if (n === 0) return null
  return { x: cx / n, y: cy / n }
}

export function resolveTavernScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'tavern') return null
  const anchor = findTavernAnchor(world, scene.lineageId)
  if (!anchor) return null

  const lineageName = world.lineage_names?.[scene.lineageId] ?? scene.lineageId.slice(0, 6)

  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []
  for (const o of world.organisms) {
    if (!o.alive) continue
    if (o.lineage_id !== scene.lineageId) continue
    if (o.age_stage === 'infant' || o.age_stage === 'child') continue
    const d = Math.abs(o.x - anchor.x) + Math.abs(o.y - anchor.y)
    if (d > TAVERN_RADIUS) continue
    const entry: SceneOccupant = {
      org: o,
      role: o.is_leader ? 'host' : 'patron',
      activity: o.thought || 'drinking',
    }
    if (d <= 3) inside.push(entry)
    else away.push(entry)
  }

  inside.sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0))

  const fixtures: SceneFixture[] = [
    { id: 'fireplace', kind: 'fireplace', x: 2, y: 6, label: 'fireplace' },
    { id: 'bar', kind: 'bar', x: 1, y: 2, label: 'bar' },
    { id: 'barrel-1', kind: 'barrel', x: 12, y: 2 },
    { id: 'barrel-2', kind: 'barrel', x: 12, y: 3 },
    { id: 'long-table', kind: 'long_table', x: 5, y: 4, label: 'table' },
    { id: 'stool-1', kind: 'stool', x: 5, y: 3 },
    { id: 'stool-2', kind: 'stool', x: 7, y: 3 },
    { id: 'stool-3', kind: 'stool', x: 9, y: 3 },
    { id: 'stool-4', kind: 'stool', x: 5, y: 7 },
    { id: 'stool-5', kind: 'stool', x: 7, y: 7 },
    { id: 'stool-6', kind: 'stool', x: 9, y: 7 },
  ]

  return {
    scene,
    world,
    title: `${lineageName} tavern`,
    subtitle: `A meeting place for the ${lineageName} tribe`,
    isDay: !!world.is_day,
    occupants: inside.slice(0, 8),
    away: away.slice(0, 12),
    fixtures,
  }
}
