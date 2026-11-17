import type { WorldState } from '../../../shared/types'
import { eventDate } from '../../event-date'
import { t } from '../../../i18n'
import { discoveryMilestones } from '../../../game/model/stats-story'

export function DiscoveryTimeline({ events }: { events: WorldState['events'] }) {
  const milestones = discoveryMilestones(events)

  if (milestones.length === 0) {
    return (
      <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>{t('dialogs.stats.noDiscoveries')}</div>
    )
  }

  return (
    <div className="stats-timeline">
      {milestones.map((e, i) => (
        <div key={i} className="stats-timeline-row">
          <span className="stats-tick">{eventDate(e.tick)}</span>
          <span className="stats-actor">{e.actor}</span>
          <span className="stats-detail">{e.detail}</span>
        </div>
      ))}
    </div>
  )
}
