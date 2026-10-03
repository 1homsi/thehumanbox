import { memo, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '../../state/store'
import { tribeEvents } from '../../game/model/tribe-events'
import { HIDDEN_EVENT_TYPES } from '../../shared/constants'
import { useWorldStore } from '../../state/worldStore'
import { EventRow } from './EventRow'
import { isNewsEvent } from '../../game/model/news'

const FILTER_KEY = 'thb-event-filter-v1'

/** The log opens on what matters; the everyday chatter is one click away. */
function savedImportantOnly(): boolean {
  try {
    return window.localStorage.getItem(FILTER_KEY) !== 'all'
  } catch {
    return true
  }
}

function EventLogImpl() {
  const events = useWorldStore((s) => s.world?.events)
  // With a tribe focused, the log is that tribe's own story.
  const focus = useUIStore((s) => s.focus)
  const lineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
  const scopeKey = useWorldStore(
    useShallow((s) => {
      if (!lineage || !s.world) return null
      const name = s.world.lineage_names?.[lineage]
      if (!name) return null
      return [
        name,
        ...s.world.organisms.filter((o) => o.alive && o.lineage_id === lineage).map((o) => o.name),
      ]
    }),
  )
  const [dramaOnly, setDramaOnlyState] = useState(savedImportantOnly)
  const setDramaOnly = (update: (v: boolean) => boolean) =>
    setDramaOnlyState((v) => {
      const next = update(v)
      try {
        window.localStorage.setItem(FILTER_KEY, next ? 'important' : 'all')
      } catch {
        // The choice simply resets next time.
      }
      return next
    })

  const recent = useMemo(() => {
    if (!events) return []
    if (scopeKey) {
      const [name, ...members] = scopeKey
      return tribeEvents(
        events,
        { name: name!, members: new Set(members) },
        (e) => !HIDDEN_EVENT_TYPES.has(e.type) && (!dramaOnly || isNewsEvent(e)),
      )
    }
    const out = []
    for (let i = events.length - 1; i >= 0 && out.length < 20; i--) {
      const e = events[i]
      if (HIDDEN_EVENT_TYPES.has(e.type)) continue
      if (dramaOnly && !isNewsEvent(e)) continue
      out.push(e)
    }
    return out
  }, [events, dramaOnly, scopeKey])

  return (
    <>
      <div className="section-title" id="event-log-heading">
        EVENTS{scopeKey ? ` · ${scopeKey[0]}` : ''}
        <button
          onClick={() => setDramaOnly((v) => !v)}
          title={
            dramaOnly
              ? 'Showing what matters. Click to show everything.'
              : 'Showing everything. Click to show only what matters.'
          }
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
          {dramaOnly ? '★ important' : '≡ all'}
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
