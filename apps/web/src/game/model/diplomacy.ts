import type { WorldState } from '../../shared/types'
import { enemiesOf } from '../render/battles'

export interface Relations {
  /** Names of tribes the tribe is allied or defended with. */
  allies: string[]
  /** Names of tribes it trades with or has a pact of peace with. */
  friends: string[]
  /** Names of tribes it is bound to, or that are bound to it. */
  vassals: string[]
  /** Names of tribes it is fighting now. */
  enemies: string[]
}

/** Who a tribe stands with and against, read from the standing treaties and battles. */
export function relationsOf(
  world: Pick<WorldState, 'treaties' | 'battles' | 'lineage_names'>,
  lineage: string,
): Relations {
  const name = (id: string) => world.lineage_names?.[id] ?? id.slice(0, 6)
  const out = { allies: new Set<string>(), friends: new Set<string>(), vassals: new Set<string>() }
  for (const t of world.treaties ?? []) {
    let other: string
    if (t.a_lineage === lineage) other = t.b_lineage
    else if (t.b_lineage === lineage) other = t.a_lineage
    else continue
    switch (t.kind) {
      case 'alliance':
      case 'defensive':
        out.allies.add(name(other))
        break
      case 'vassalage':
        out.vassals.add(name(other))
        break
      default:
        out.friends.add(name(other))
    }
  }
  const enemies = enemiesOf(world.battles, lineage).map(name)
  return {
    allies: [...out.allies].sort(),
    friends: [...out.friends].filter((n) => !out.allies.has(n)).sort(),
    vassals: [...out.vassals].sort(),
    enemies: enemies.sort(),
  }
}

/** "allied with X, Y · trades with Z", or null when a tribe stands alone. */
export function relationsLine(r: Relations): string | null {
  const parts: string[] = []
  if (r.allies.length) parts.push(`allied with ${r.allies.slice(0, 3).join(', ')}`)
  if (r.vassals.length) parts.push(`bound to ${r.vassals.slice(0, 2).join(', ')}`)
  if (r.friends.length) parts.push(`at peace with ${r.friends.slice(0, 3).join(', ')}`)
  return parts.length ? parts.join(' · ') : null
}
