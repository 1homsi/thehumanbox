import type { SimEvent } from '../types'
import { EVENT_ICONS, EVENT_COLORS } from '../utils/constants'

/** Rows about the player's own role: prayers and how they ended. */
const GODLY = new Set(['prayer', 'answered', 'forsaken'])

export function EventRow({ event }: { event: SimEvent }) {
  return (
    <div className={'event-row' + (GODLY.has(event.type) ? ' godly' : '')}>
      <span className="event-tick">{event.tick}</span>
      <span className="event-icon" style={{ color: EVENT_COLORS[event.type] }}>
        {EVENT_ICONS[event.type]}
      </span>
      <span className="event-actor">{event.actor}</span>
      <span className="event-detail">{event.detail}</span>
    </div>
  )
}
