import { t } from '../../i18n'
import type { TribeStatus } from '../../game/model/tribe-status'
import { tribeReasoning } from '../../game/model/tribe-reasoning'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import type { WorldState } from '../../shared/types'
import { needLine, nextLine, objectiveLine, stanceLine, workLine } from './tribe-reasoning-text'

/**
 * The tribe's reasoning, for its card: what it is guided to, what it needs most, what its people are at
 * work on, how it stands with its neighbours and what it is about to try. That last line takes the camera
 * to the tribe, to watch what happens next.
 */
export function TribeReasoning({ world, status }: { world: WorldState; status: TribeStatus }) {
  const r = tribeReasoning(world, status)
  const next = nextLine(r.next)
  const home = tribeHome(world, status.id)
  return (
    <section className="tribe-why" aria-label={t('panels.tribe.why.title')}>
      <div className="tribe-why-title">{t('panels.tribe.why.title')}</div>
      <p>{objectiveLine(r.objective)}</p>
      <p>{needLine(r.pressing)}</p>
      <p>{workLine(r.work)}</p>
      <p>{stanceLine(r.stance)}</p>
      {home ? (
        <button
          className="tribe-why-next"
          title={t('panels.tribe.history.goTo')}
          onClick={() => useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y))}
        >
          {next}
        </button>
      ) : (
        <p className="tribe-why-next">{next}</p>
      )}
    </section>
  )
}
