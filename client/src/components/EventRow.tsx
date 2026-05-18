import type { SimEvent } from '../types'
import { EVENT_ICONS, EVENT_COLORS } from '../utils/constants'

export function EventRow({ event }: { event: SimEvent }) {
  return (
    <div className="event-row">
      <span className="event-tick">{event.tick}</span>
      <span className="event-icon" style={{ color: EVENT_COLORS[event.type] }}>
        {EVENT_ICONS[event.type]}
      </span>
      <span className="event-actor">{event.actor}</span>
      <span className="event-detail">{event.detail}</span>
    </div>
  )
}
