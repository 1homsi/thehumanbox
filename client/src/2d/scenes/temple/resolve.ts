import type { SceneContext, SceneFixture, SceneId, SceneOccupant } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'

const TEMPLE_RADIUS = 20

const KIND_SUBTITLE: Record<string, string> = {
  Animism: 'a stone shrine to the spirits',
  Polytheism: 'a temple of many gods',
  Monotheism: 'a sanctified house of the one god',
  Philosophical: 'a hall of contemplation',
  Secular: 'a civic hall of remembrance',
  animism: 'a stone shrine to the spirits',
  polytheism: 'a temple of many gods',
  monotheism: 'a sanctified house of the one god',
  philosophical: 'a hall of contemplation',
  secular: 'a civic hall of remembrance',
}

export function resolveTempleScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'temple') return null
  const religion = (world.religions ?? []).find((r) => r.id === scene.religionId)
  if (!religion) return null
  const lineageId = religion.founder_lineage ?? religion.lineage_id ?? ''

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
  const ax = cx / n
  const ay = cy / n

  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []
  for (const o of world.organisms) {
    if (!o.alive) continue
    const sameFaith = o.religion_id === religion.id
    const sameLineage = o.lineage_id === lineageId
    if (!sameFaith && !sameLineage) continue
    const d = Math.abs(o.x - ax) + Math.abs(o.y - ay)
    if (d > TEMPLE_RADIUS) continue
    const piety = o.piety ?? 0
    const entry: SceneOccupant = {
      org: o,
      role: o.is_leader ? 'host' : 'worshipper',
      activity: piety > 0.5 ? 'praying' : sameFaith ? 'reflecting' : 'observing',
    }
    if (d <= 4 && (sameFaith || piety > 0.2)) inside.push(entry)
    else away.push(entry)
  }

  const fixtures: SceneFixture[] = [
    { id: 'altar', kind: 'altar', x: 6, y: 1, label: 'altar' },
    { id: 'candle-l', kind: 'candle', x: 4, y: 2 },
    { id: 'candle-r', kind: 'candle', x: 10, y: 2 },
    { id: 'idol', kind: 'idol', x: 7, y: 3 },
    { id: 'pew-1', kind: 'pew', x: 3, y: 6 },
    { id: 'pew-2', kind: 'pew', x: 8, y: 6 },
    { id: 'brazier-l', kind: 'brazier', x: 2, y: 7 },
    { id: 'brazier-r', kind: 'brazier', x: 12, y: 7 },
  ]

  return {
    scene,
    world,
    title: religion.name,
    subtitle: `${KIND_SUBTITLE[religion.kind ?? ''] ?? 'a place of worship'} · ${inside.length + away.length} of the faith nearby`,
    isDay: !!world.is_day,
    occupants: inside.slice(0, 8),
    away: away.slice(0, 12),
    fixtures,
  }
}
