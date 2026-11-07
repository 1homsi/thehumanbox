import { formatNumber, t } from '../../i18n'
import type { WorldState } from '../../shared/types'
import { tribeStatus } from '../../game/model/tribe-status'
import { tribeReasoning } from '../../game/model/tribe-reasoning'
import type { OpeningBeat } from '../../state/opening-guide'
import { needLine, nextLine, workLine } from '../panels/tribe-reasoning-text'

/** The tribe with the most living people: the one a new player is most likely to see do things. */
export function largestTribe(world: Pick<WorldState, 'organisms'>): string | null {
  const counts = new Map<string, number>()
  for (const o of world.organisms) {
    if (o.alive === false) continue
    counts.set(o.lineage_id, (counts.get(o.lineage_id) ?? 0) + 1)
  }
  let best: string | null = null
  let most = 0
  for (const [id, n] of counts) {
    if (n > most) {
      best = id
      most = n
    }
  }
  return best
}

function tribeCount(world: Pick<WorldState, 'organisms'>): number {
  return new Set(world.organisms.filter((o) => o.alive !== false).map((o) => o.lineage_id)).size
}

/** The one line the opening shows for a beat, about the tribe it follows. */
export function openingLine(beat: OpeningBeat, world: WorldState, tribe: string): string | null {
  const status = tribeStatus(world, tribe)
  if (!status) return null
  const name = status.name
  switch (beat) {
    case 'meet':
      return t('dialogs.opening.meet', { tribe: name })
    case 'work':
      return `${name} · ${workLine(tribeReasoning(world, status).work)}`
    case 'need': {
      const r = tribeReasoning(world, status)
      return `${name} · ${needLine(r.pressing)} · ${nextLine(r.next)}`
    }
    case 'powers':
      return status.prayer
        ? t('dialogs.opening.powersPrayer', { tribe: name })
        : t('dialogs.opening.powers', { tribe: name })
    case 'history':
      return t('dialogs.opening.history')
    case 'world':
      return t('dialogs.opening.world', { tribe: name, count: formatNumber(tribeCount(world)) })
  }
}
