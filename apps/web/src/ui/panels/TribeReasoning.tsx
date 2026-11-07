import { t } from '../../i18n'
import type { TribeStatus } from '../../game/model/tribe-status'
import { tribeReasoning } from '../../game/model/tribe-reasoning'
import type { WorldState } from '../../shared/types'
import { needLine, nextLine, objectiveLine, stanceLine, workLine } from './tribe-reasoning-text'

/**
 * The tribe's reasoning, for its card: what it is guided to, what it needs most, what its people are at
 * work on, how it stands with its neighbours and what it is about to try.
 */
export function TribeReasoning({ world, status }: { world: WorldState; status: TribeStatus }) {
  const r = tribeReasoning(world, status)
  return (
    <section className="tribe-why" aria-label={t('panels.tribe.why.title')}>
      <div className="tribe-why-title">{t('panels.tribe.why.title')}</div>
      <p>{objectiveLine(r.objective)}</p>
      <p>{needLine(r.pressing)}</p>
      <p>{workLine(r.work)}</p>
      <p>{stanceLine(r.stance)}</p>
      <p className="tribe-why-next">{nextLine(r.next)}</p>
    </section>
  )
}
