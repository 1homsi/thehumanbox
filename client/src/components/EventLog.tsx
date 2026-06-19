import { memo, useMemo, useState } from 'react'
import { HIDDEN_EVENT_TYPES } from '../utils/constants'
import { useWorldStore } from '../stores/worldStore'
import { EventRow } from './EventRow'

const DRAMA_EVENT_TYPES = new Set([
  'war_declared',
  'battle',
  'challenge',
  'era',
  'milestone',
  'treaty',
  'government_changed',
  'outbreak',
  'festival',
  'death',
  'died',
])

function EventLogImpl() {
  const events = useWorldStore((s) => s.world?.events)
  const [dramaOnly, setDramaOnly] = useState(false)

  const recent = useMemo(() => {
    if (!events) return []
    const out = []
    for (let i = events.length - 1; i >= 0 && out.length < 20; i--) {
      const e = events[i]
      if (HIDDEN_EVENT_TYPES.has(e.type)) continue
      if (dramaOnly && !DRAMA_EVENT_TYPES.has(e.type)) continue
      out.push(e)
    }
    return out
  }, [events, dramaOnly])

  return (
    <>
      <div className="section-title" id="event-log-heading">
        EVENTS
        <button
          onClick={() => setDramaOnly((v) => !v)}
          title="show only dramatic events"
          style={{
            marginLeft: 8,
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 3,
            cursor: 'pointer',
            background: dramaOnly ? 'rgba(232,120,80,0.25)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(232,120,80,0.4)',
            color: dramaOnly ? '#ffb38a' : '#998',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          ⚔ drama
        </button>
      </div>
      <div className="event-log" role="log" aria-live="polite" aria-labelledby="event-log-heading">
        {recent.map((e, i) => (
          <EventRow key={`${e.tick}-${i}`} event={e} />
        ))}
      </div>
    </>
  )
}

export const EventLog = memo(EventLogImpl)
