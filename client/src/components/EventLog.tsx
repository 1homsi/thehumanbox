import { memo, useMemo } from 'react'
import { HIDDEN_EVENT_TYPES } from '../utils/constants'
import { useWorldStore } from '../stores/worldStore'
import { EventRow } from './EventRow'

/**
 * Sidebar event log. Subscribes only to world.events so it re-renders
 * only when an event lands - not when organism positions tick.
 */
function EventLogImpl() {
  const events = useWorldStore((s) => s.world?.events)

  // Filter + slice once per render; events array reference only changes
  // when a new event is appended on the server.
  const recent = useMemo(() => {
    if (!events) return []
    const out = []
    for (let i = events.length - 1; i >= 0 && out.length < 20; i--) {
      const e = events[i]
      if (!HIDDEN_EVENT_TYPES.has(e.type)) out.push(e)
    }
    return out
  }, [events])

  return (
    <>
      <div className="section-title">EVENTS</div>
      <div className="event-log">
        {recent.map((e, i) => (
          <EventRow key={`${e.tick}-${i}`} event={e} />
        ))}
      </div>
    </>
  )
}

export const EventLog = memo(EventLogImpl)
