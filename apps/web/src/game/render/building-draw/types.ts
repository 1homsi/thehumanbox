import type { Building } from '../../../shared/types'

export type BuildingLike = Pick<
  Building,
  | 'id'
  | 'kind'
  | 'x'
  | 'y'
  | 'footprint'
  | 'fw'
  | 'fh'
  | 'condition'
  | 'damage'
  | 'integrity'
  | 'ruined'
  | 'repairing'
> & {
  /** Architectural tier of the owning tribe's era (see ERA_TIERS). */
  tier?: number
  /** A passing visual state, such as a spaceport whose rocket is away. */
  state?: string
  /** How far a ruin is toward crumbling away: 0 fresh, 1 about to go. */
  ruinAge?: number
  /** Winter: snow lies on the roof of a house-like building. */
  snow?: boolean
  /** The land a stone-age home stands on (see HomeLand in building-painters/land-homes.ts). */
  land?: string
}

export type BuildingVisualDetail = 'overview' | 'standard' | 'detail'
