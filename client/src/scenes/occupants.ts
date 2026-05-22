import type { OrganismState, WorldState } from '../types'
import type { OccupantRole, SceneOccupant } from './types'

const HOUSEHOLD_RADIUS = 6
const HOST_RADIUS      = 4

export function isAtHome(org: OrganismState | undefined | null): boolean {
  if (!org || !org.alive) return false
  const dx = org.x - org.home_x
  const dy = org.y - org.home_y
  return Math.abs(dx) + Math.abs(dy) <= HOST_RADIUS
}

function roleFor(host: OrganismState, other: OrganismState): OccupantRole {
  if (other.id === host.id)                                       return 'host'
  if (host.partner_id && host.partner_id === other.id)            return 'partner'
  if (other.parent_id === host.id || other.father_id === host.id) return 'child'
  if (other.lineage_id === host.lineage_id)                       return 'kin'
  return 'guest'
}

export function householdAround(world: WorldState, host: OrganismState): SceneOccupant[] {
  const result: SceneOccupant[] = [
    { org: host, role: 'host', activity: host.thought || 'home' },
  ]
  for (const o of world.organisms) {
    if (!o.alive || o.id === host.id) continue
    const dx = o.x - host.home_x
    const dy = o.y - host.home_y
    if (Math.abs(dx) + Math.abs(dy) > HOUSEHOLD_RADIUS) continue
    result.push({
      org:      o,
      role:     roleFor(host, o),
      activity: o.thought || 'idling',
    })
  }
  return result
}
