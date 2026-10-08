import { calendarAt } from '../../game/model/calendar'
import { Tooltip } from '../toolbar/Tooltip'

/** The date in the header: "Year 12 · Spring". The tooltip says how far into the season it is. */
export function CalendarChip({ tick }: { tick: number }) {
  const date = calendarAt(tick)
  const tip = (
    <span className="tip-card">
      <span className="tip-title">
        Year {date.year}, {date.season}
      </span>
      <span className="tip-body">
        Day {date.dayOfSeason} of 5 in {date.season.toLowerCase()}. A year is four seasons, and people age by
        the years they have lived.
      </span>
    </span>
  )
  return (
    <Tooltip tip={tip}>
      <span className="hdr-chip calendar-chip" style={{ cursor: 'default' }}>
        Year {date.year} · {date.season}
      </span>
    </Tooltip>
  )
}
