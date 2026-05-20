import { memo, useMemo } from 'react'
import { HIDDEN_EVENT_TYPES } from '../utils/constants'
import { useWorldStore } from '../stores/worldStore'
import { EventRow } from './EventRow'

function EventLogImpl() {
  const events = useWorldStore((s) => s.world?.events)

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
      <div className="section-title" id="event-log-heading">EVENTS</div>
      <div
        className="event-log"
        role="log"
        aria-live="polite"
        aria-labelledby="event-log-heading"
      >
        {recent.map((e, i) => (
          <EventRow key={`${e.tick}-${i}`} event={e} />
        ))}
      </div>
    </>
  )
}

export const EventLog = memo(EventLogImpl)
