import type { Building } from '../../../shared/types'
import { padEmpty } from '../era-traffic'
import { normKind } from './footprints'

/**
 * The passing visual state a building's painter draws (see `P.state`): 'empty' while a spaceport's
 * rocket is away, and `hull1`..`hull3` while a shipyard has a hull on its slip (a keel, its ribs,
 * then the planked hull). A shipyard with nothing on the slip has no state and paints an empty slip.
 */
export function passingState(b: Pick<Building, 'id' | 'kind' | 'slip'>, tick: number): string | undefined {
  // The sim sends kinds in snake case ('shipyard'); the painters key on the normalised name.
  const kind = normKind(b.kind)
  if (kind === 'Spaceport') return padEmpty(b.id, tick) ? 'empty' : undefined
  if (kind === 'Shipyard' && b.slip) return `hull${Math.max(1, Math.min(3, Math.round(b.slip)))}`
  return undefined
}
