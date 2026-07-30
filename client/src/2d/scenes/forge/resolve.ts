import type { SceneContext, SceneFixture, SceneId, SceneOccupant } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'
import { getBuildingState } from '../../../world/building-state'

const RADIUS = 14

export function resolveForgeScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'forge' && scene.kind !== 'bakery' && scene.kind !== 'mill') return null
  const building = world.buildings?.find((b) => b.id === scene.buildingId)
  if (!building || !getBuildingState(building).isOperational) return null

  const kind = scene.kind
  const wantedSpecialties: string[] =
    kind === 'forge'
      ? ['smith', 'carpenter', 'builder', 'mason']
      : kind === 'bakery'
        ? ['baker', 'brewer']
        : ['miller', 'farmer', 'carpenter']

  const ax = building.x + 0.5
  const ay = building.y + 0.5

  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []
  for (const o of world.organisms) {
    if (!o.alive) continue
    if (o.age_stage === 'infant') continue
    const d = Math.abs(o.x - ax) + Math.abs(o.y - ay)
    if (d > RADIUS) continue
    const isWorker = !!o.specialty && wantedSpecialties.includes(o.specialty)
    if (!isWorker && d > 6) continue
    const entry: SceneOccupant = {
      org: o,
      role: isWorker ? 'host' : 'patron',
      activity: isWorker ? `working at the ${kind}` : o.thought || 'visiting',
    }
    if (d <= 3) inside.push(entry)
    else away.push(entry)
  }

  const ownerLineage = (building as { owner_lineage?: string }).owner_lineage ?? ''
  const lineageName =
    world.lineage_names?.[ownerLineage] ?? (ownerLineage ? ownerLineage.slice(0, 6) : 'unowned')

  const subtitle =
    kind === 'forge'
      ? `Iron, anvil, and smoke · ${lineageName}`
      : kind === 'bakery'
        ? `Bread, ovens, and yeast · ${lineageName}`
        : `Grain, stones, and flour · ${lineageName}`

  const fixtures: SceneFixture[] =
    kind === 'forge'
      ? [
          { id: 'anvil', kind: 'anvil', x: 6, y: 5 },
          { id: 'forge-fire', kind: 'forge_fire', x: 2, y: 5 },
          { id: 'rack', kind: 'tool_rack', x: 10, y: 2 },
          { id: 'quench', kind: 'quench', x: 10, y: 6 },
        ]
      : kind === 'bakery'
        ? [
            { id: 'oven', kind: 'oven', x: 2, y: 5 },
            { id: 'table', kind: 'work_table', x: 6, y: 5 },
            { id: 'sacks', kind: 'sacks', x: 10, y: 5 },
          ]
        : [
            { id: 'wheel', kind: 'mill_wheel', x: 2, y: 5 },
            { id: 'stones', kind: 'grindstones', x: 6, y: 5 },
            { id: 'sacks', kind: 'sacks', x: 10, y: 5 },
          ]

  return {
    scene,
    world,
    title:
      kind === 'forge'
        ? `${lineageName} forge`
        : kind === 'bakery'
          ? `${lineageName} bakery`
          : `${lineageName} mill`,
    subtitle,
    isDay: !!world.is_day,
    occupants: inside.slice(0, 6),
    away: away.slice(0, 12),
    fixtures,
  }
}
