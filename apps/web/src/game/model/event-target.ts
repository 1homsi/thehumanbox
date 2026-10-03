import type { SimEvent, WorldState } from '../../shared/types'

export type EventTarget =
  | { kind: 'tribe'; lineage: string; at: { x: number; y: number } | null }
  | { kind: 'person'; id: string; at: { x: number; y: number } }

/**
 * What an event in the log is about, if it can be found on the map: a tribe
 * named as its actor, or a living person by name. Prayers name their tribe.
 */
export function eventTarget(
  world: Pick<WorldState, 'lineage_names' | 'settlements' | 'organisms'>,
  event: Pick<SimEvent, 'actor'>,
): EventTarget | null {
  const actor = event.actor.replace(/^the /i, '').trim()
  if (!actor) return null
  const lineage = Object.entries(world.lineage_names ?? {}).find(([, name]) => name === actor)?.[0]
  if (lineage) {
    const home = world.settlements?.find((s) => s.lineage_id === lineage)
    if (home) return { kind: 'tribe', lineage, at: { x: home.center[0], y: home.center[1] } }
    const people = world.organisms.filter((o) => o.alive !== false && o.lineage_id === lineage)
    const at =
      people.length > 0
        ? {
            x: people.reduce((n, o) => n + o.x, 0) / people.length,
            y: people.reduce((n, o) => n + o.y, 0) / people.length,
          }
        : null
    return { kind: 'tribe', lineage, at }
  }
  const person = world.organisms.find((o) => o.alive !== false && o.name === event.actor)
  if (person) return { kind: 'person', id: person.id, at: { x: person.x, y: person.y } }
  return null
}
