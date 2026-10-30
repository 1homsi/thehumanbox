import clsx from 'clsx'
import { calendarAt } from '../../game/model/calendar'
import { placeOf } from '../../game/model/tribe-history'
import { causeText, endSummary, extinctionOf } from '../../game/model/tribe-end'
import { lineageColor } from '../../shared/constants'
import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { knownTribeName } from '../../state/worldStore'
import { t } from '../../i18n'
import { lineText } from './tribe-history-text'
import { TribeHistory } from './TribeHistory'

interface Props {
  world: WorldState
  lineage: string
}

/** What an end-summary line says. The extinction line states the recorded death cause; the rest are history. */
function summaryText(row: TribeChronicleRow, world: WorldState, causal: boolean): string {
  if (!causal) return lineText(row, world)
  return row.word
    ? t('panels.tribe.fallen.cause', { cause: causeText(row.word) })
    : t('panels.tribe.fallen.noCause')
}

/**
 * The card of a tribe that has died out: its name, the year it ended, a short end summary of its last events
 * and its full history. Nothing here is live; the summary's first line is the death cause the sim recorded,
 * and every other line is only context. A line with a place takes the camera there; one without a place
 * but with another tribe opens that tribe's card.
 */
export function FallenTribe({ world, lineage }: Props) {
  const setFocus = useUIStore((s) => s.setFocus)
  const rows = world.tribe_chronicle?.[lineage]
  const end = extinctionOf(rows)
  const name = knownTribeName(world.lineage_names, lineage) ?? lineage.slice(0, 6)
  const summary = endSummary(rows)
  return (
    <div
      className="tribe-card tribe-card-fallen"
      role="region"
      aria-label={t('panels.tribe.regionLabel', { name })}
    >
      <div className="tribe-card-head">
        <span className="lineage-dot" style={{ background: lineageColor(lineage) }} />
        <span className="tribe-card-name">{name}</span>
        <button
          className="tribe-card-close"
          aria-label={t('panels.tribe.close')}
          onClick={() => setFocus('all')}
        >
          ×
        </button>
      </div>
      {end && (
        <div className="tribe-card-sub">
          {t('panels.tribe.fallen.diedOut', { year: calendarAt(end.tick).year })}
        </div>
      )}
      {summary.length > 0 && (
        <section className="tribe-history tribe-end" aria-label={t('panels.tribe.fallen.endTitle')}>
          <div className="tribe-history-title">{t('panels.tribe.fallen.endTitle')}</div>
          <ol className="tribe-history-list">
            {summary.map(({ row, causal }, i) => {
              const place = placeOf(row)
              const label = (
                <>
                  <span className={clsx('tribe-end-tag', causal && 'cause')}>
                    {causal ? t('panels.tribe.fallen.causeTag') : t('panels.tribe.fallen.contextTag')}
                  </span>{' '}
                  <span>{summaryText(row, world, causal)}</span>
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
                  ) : row.other ? (
                    <button
                      className="tribe-history-go"
                      title={t('panels.tribe.fallen.openOther')}
                      onClick={() => setFocus(`lineage:${row.other}`)}
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
        </section>
      )}
      <TribeHistory world={world} lineage={lineage} />
    </div>
  )
}
