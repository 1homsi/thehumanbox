import clsx from 'clsx'
import { calendarAt } from '../../game/model/calendar'
import { placeOf } from '../../game/model/tribe-history'
import { seriesPoints, type SeriesSample } from '../../game/model/tribe-series'
import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { useCameraFocus } from '../../state/camera-focus'
import { formatNumber, t } from '../../i18n'
import { lineText } from './tribe-history-text'

/** The events that go on the timeline: the ones that change a tribe's course. Crafts stay in the history list. */
const TIMELINE_KINDS = new Set<TribeChronicleRow['kind']>([
  'war',
  'raid',
  'era',
  'famine',
  'arrival',
  'split',
  'leader_died',
])

const CHART_W = 260
const CHART_H = 26

interface Props {
  world: WorldState
  lineage: string
  /** The tribe's samples over time, oldest first (see `tribe-series.ts`). */
  samples: readonly SeriesSample[]
}

/**
 * Small charts of a tribe's people, food and health over time, on one time axis with its major events as
 * markers. A marker with a place takes the camera there when clicked. Everything is drawn inside the card.
 */
export function TribeTimeline({ world, lineage, samples }: Props) {
  if (samples.length < 2) {
    return (
      <section className="tribe-timeline" aria-label={t('panels.tribe.timeline.title')}>
        <div className="tribe-history-title">{t('panels.tribe.timeline.title')}</div>
        <p className="tribe-history-empty">{t('panels.tribe.timeline.notEnough')}</p>
      </section>
    )
  }
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const events = (world.tribe_chronicle?.[lineage] ?? []).filter(
    (row) => TIMELINE_KINDS.has(row.kind) && row.tick >= first.tick,
  )
  // The charts and the markers share this one tick range, so a point and an event at the same tick line up. It
  // runs to the latest event when one came after the last sample (samples are a few hundred ticks apart), so a
  // war that just broke out shows at once; it does not run on to today, which would squeeze a fallen tribe's
  // charts a little more every tick.
  const end = Math.max(last.tick, ...events.map((row) => row.tick))
  const span = Math.max(1, end - first.tick)
  const at = (tick: number) => ((tick - first.tick) / span) * 100
  const peopleTop = Math.max(1, ...samples.map((s) => s.people))
  const charts = [
    {
      key: 'people',
      label: t('panels.tribe.timeline.people'),
      value: formatNumber(last.people),
      points: seriesPoints(
        samples.map((s) => ({ tick: s.tick, value: s.people })),
        CHART_W,
        CHART_H,
        0,
        peopleTop,
        first.tick,
        end,
      ),
    },
    {
      key: 'food',
      label: t('panels.tribe.timeline.food'),
      value: `${Math.round(last.food * 100)}%`,
      points: seriesPoints(
        samples.map((s) => ({ tick: s.tick, value: s.food })),
        CHART_W,
        CHART_H,
        0,
        1,
        first.tick,
        end,
      ),
    },
    {
      key: 'health',
      label: t('panels.tribe.timeline.health'),
      value: `${Math.round(last.health * 100)}%`,
      points: seriesPoints(
        samples.map((s) => ({ tick: s.tick, value: s.health })),
        CHART_W,
        CHART_H,
        0,
        1,
        first.tick,
        end,
      ),
    },
  ]

  return (
    <section className="tribe-timeline" aria-label={t('panels.tribe.timeline.title')}>
      <div className="tribe-history-title">{t('panels.tribe.timeline.title')}</div>
      {charts.map((chart) => (
        <div className="tribe-timeline-row" key={chart.key}>
          <span className="tribe-timeline-label">{chart.label}</span>
          <svg
            className={clsx('tribe-timeline-chart', chart.key)}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={chart.points} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="tribe-timeline-value">{chart.value}</span>
        </div>
      ))}
      <div className="tribe-timeline-track">
        {events.map((row, i) => {
          const place = placeOf(row)
          const title = `${t('panels.calendar.year', { year: calendarAt(row.tick).year })} · ${lineText(row, world)}`
          const style = { left: `${at(row.tick)}%` }
          return place ? (
            <button
              key={`${row.tick}-${row.kind}-${i}`}
              className="tribe-timeline-marker"
              style={style}
              title={title}
              aria-label={title}
              onClick={() => useCameraFocus.getState().focusTile(Math.round(place[0]), Math.round(place[1]))}
            />
          ) : (
            // No place to go to, but the same description, reachable by keyboard: this may be the only
            // mention of an event older than the history list shows.
            <span
              key={`${row.tick}-${row.kind}-${i}`}
              className="tribe-timeline-marker plain"
              style={style}
              title={title}
              role="img"
              aria-label={title}
              tabIndex={0}
            />
          )
        })}
      </div>
      <div className="tribe-timeline-axis" aria-hidden="true">
        <span>{t('panels.calendar.year', { year: calendarAt(first.tick).year })}</span>
        <span>{t('panels.calendar.year', { year: calendarAt(end).year })}</span>
      </div>
    </section>
  )
}
