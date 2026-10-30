import { calendarAt } from '../../game/model/calendar'
import { historyRows, placeOf } from '../../game/model/tribe-history'
import type { WorldState } from '../../shared/types'
import { useCameraFocus } from '../../state/camera-focus'
import { t } from '../../i18n'
import { lineText } from './tribe-history-text'

/**
 * A tribe's own history on its card: its newest wars, ages, famines, arrivals, splits, crafts and lost
 * leaders. A line with a place takes the camera there when clicked.
 */
export function TribeHistory({
  world,
  lineage,
  limit,
}: {
  world: WorldState
  lineage: string
  /** How many of the newest lines to show; the living card shows the latest 12. */
  limit?: number
}) {
  const rows = historyRows(world.tribe_chronicle?.[lineage], limit)
  return (
    <section className="tribe-history" aria-label={t('panels.tribe.history.title')}>
      <div className="tribe-history-title">{t('panels.tribe.history.title')}</div>
      {rows.length === 0 ? (
        <p className="tribe-history-empty">{t('panels.tribe.history.empty')}</p>
      ) : (
        <ol className="tribe-history-list">
          {rows.map((row, i) => {
            const place = placeOf(row)
            const label = (
              <>
                <span className="tribe-history-when">
                  {t('panels.calendar.year', { year: calendarAt(row.tick).year })}
                </span>{' '}
                <span>{lineText(row, world)}</span>
              </>
            )
            return (
              <li key={`${row.tick}-${row.kind}-${i}`}>
                {place ? (
                  <button
                    className="tribe-history-go"
                    title={t('panels.tribe.history.goTo')}
                    onClick={() =>
                      useCameraFocus.getState().focusTile(Math.round(place[0]), Math.round(place[1]))
                    }
                  >
                    {label}
                  </button>
                ) : (
                  <span className="tribe-history-plain">{label}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
