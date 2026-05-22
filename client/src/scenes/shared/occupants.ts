import type { OrganismState, WorldState } from '../../types'
import type { OccupantRole, SceneOccupant } from '../core/types'

const INSIDE_RADIUS = 1
const HOUSEHOLD_RADIUS = 6
const STRUCTURE_MIN = 0.35

function structureAt(world: WorldState, x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const row = world.grid?.structure?.[iy]
  if (!row) return 0
  const v = row[ix]
  return typeof v === 'number' ? v : 0
}

function isInsideHome(org: OrganismState, world: WorldState): boolean {
  const dx = Math.floor(org.x) - Math.floor(org.home_x)
  const dy = Math.floor(org.y) - Math.floor(org.home_y)
  if (Math.abs(dx) > INSIDE_RADIUS || Math.abs(dy) > INSIDE_RADIUS) return false
  return structureAt(world, org.home_x, org.home_y) >= STRUCTURE_MIN
}

export function isAtHome(
  org: OrganismState | undefined | null,
  world: WorldState | undefined | null,
): boolean {
  if (!org || !org.alive || !world) return false
  return isInsideHome(org, world)
}

export function hasBuiltHome(
  org: OrganismState | undefined | null,
  world: WorldState | undefined | null,
): boolean {
  if (!org || !world) return false
  return structureAt(world, org.home_x, org.home_y) >= STRUCTURE_MIN
}

function roleFor(host: OrganismState, other: OrganismState): OccupantRole {
  if (other.id === host.id) return 'host'
  if (host.partner_id && host.partner_id === other.id) return 'partner'
  if (other.parent_id === host.id || other.father_id === host.id) return 'child'
  if (other.lineage_id === host.lineage_id) return 'kin'
  return 'guest'
}

export interface HouseholdResolved {
  inside: SceneOccupant[]
  away: SceneOccupant[]
}

export function householdAround(world: WorldState, host: OrganismState): HouseholdResolved {
  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []

  const hostInside = isInsideHome(host, world)
  const hostEntry: SceneOccupant = {
    org: host,
    role: 'host',
    activity: host.thought || (hostInside ? 'at home' : 'out'),
  }
  if (hostInside) inside.push(hostEntry)
  else away.push(hostEntry)

  for (const o of world.organisms) {
    if (!o.alive || o.id === host.id) continue
    const dx = o.x - host.home_x
    const dy = o.y - host.home_y
    const manhattan = Math.abs(dx) + Math.abs(dy)
    if (manhattan > HOUSEHOLD_RADIUS) continue
    const role = roleFor(host, o)
    const entry: SceneOccupant = { org: o, role, activity: o.thought || 'idling' }
    if (isInsideHome({ ...o, home_x: host.home_x, home_y: host.home_y } as OrganismState, world)) {
      inside.push(entry)
    } else {
      away.push(entry)
    }
  }
  return { inside, away }
}
