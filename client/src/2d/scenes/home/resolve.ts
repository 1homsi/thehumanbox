import type { SceneContext, SceneFixture, SceneId } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'
import { householdAround } from '../../../scenes/shared/occupants'

const ERA_LABEL: Record<string, string> = {
  'pre-stone': 'A bare windbreak',
  stone: 'A stone-walled hut',
  bronze: 'A timber-and-thatch home',
  iron: 'An iron-age cottage',
  classical: 'A clay-tiled house',
  medieval: 'A timbered cottage',
  renaissance: 'A two-story dwelling',
  industrial: 'A brick row-house',
  modern: 'A house',
  information: 'A small apartment',
}

function fixturesForEra(era: string): SceneFixture[] {
  const base: SceneFixture[] = [
    { id: 'hearth', kind: 'hearth', x: 18, y: 70, label: 'hearth' },
    { id: 'mat-1', kind: 'mat', x: 80, y: 70, label: 'sleeping mat' },
    { id: 'storage', kind: 'storage', x: 80, y: 25, label: 'storage' },
  ]
  if (era === 'pre-stone' || era === 'stone') return base
  base.push({ id: 'bench', kind: 'bench', x: 50, y: 30, label: 'workbench' })
  if (era === 'bronze' || era === 'iron') return base
  base.push({ id: 'table', kind: 'table', x: 50, y: 50, label: 'table' })
  if (era === 'classical' || era === 'medieval') return base
  base.push({ id: 'shelf', kind: 'shelf', x: 18, y: 25, label: 'shelf' })
  return base
}

export function resolveHomeScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'home') return null
  const host = world.organisms.find((o) => o.id === scene.orgId)
  if (!host || !host.alive) return null

  const era =
    (world.lineage_eras && Array.isArray(world.lineage_eras)
      ? world.lineage_eras.find((e) => e.lineage_id === host.lineage_id)?.era_name
      : (world.lineage_eras as Record<string, string> | undefined)?.[host.lineage_id]) ?? 'pre-stone'

  const { inside, away } = householdAround(world, host)

  const lineageName = world.lineage_names?.[host.lineage_id] ?? host.lineage_id.slice(0, 6)
  const isDay = !!world.is_day

  return {
    scene,
    world,
    title: `${host.name}'s home`,
    subtitle: `${ERA_LABEL[era] ?? 'A home'} · ${lineageName} · ${era}`,
    isDay,
    occupants: inside,
    away,
    fixtures: fixturesForEra(era),
  }
}
