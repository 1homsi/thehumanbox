import type { SimEvent } from '../types'
import { useCameraFocus } from '../stores/camera-focus'
import { useUIStore } from '../stores/store'
import { useWorldStore } from '../stores/worldStore'
import { EVENT_ICONS, EVENT_COLORS } from '../utils/constants'
import { eventTarget } from '../world/event-target'

/** Rows about the player's own role: prayers and how they ended. */
const GODLY = new Set(['prayer', 'answered', 'forsaken'])

/** Go to what an event is about: open its tribe, or select its person. */
function goTo(event: SimEvent) {
  const world = useWorldStore.getState().world
  if (!world) return
  const target = eventTarget(world, event)
  if (!target) return
  const ui = useUIStore.getState()
  if (target.kind === 'tribe') ui.setFocus(`lineage:${target.lineage}`)
  else ui.selectOrg(target.id)
  if (target.at) useCameraFocus.getState().focusTile(Math.round(target.at.x), Math.round(target.at.y))
}

export function EventRow({ event }: { event: SimEvent }) {
  return (
    <div
      className={'event-row' + (GODLY.has(event.type) ? ' godly' : '')}
      role="button"
      tabIndex={0}
      title="Go there"
      onClick={() => goTo(event)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goTo(event)
        }
      }}
    >
      <span className="event-tick">{event.tick}</span>
      <span className="event-icon" style={{ color: EVENT_COLORS[event.type] }}>
        {EVENT_ICONS[event.type]}
      </span>
      <span className="event-actor">{event.actor}</span>
      <span className="event-detail">{event.detail}</span>
    </div>
  )
}
