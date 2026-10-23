import type { WorldState } from '../../../shared/types'
import { DAY_LENGTH } from './constants'
import { formatNumber, t } from '../../../i18n'

export function DiscoveryTimeline({ events }: { events: WorldState['events'] }) {
  const milestones = events
    .filter(
      (e) =>
        e.type === 'build' &&
        (e.detail.includes('mastered') ||
          e.detail.includes('discovered') ||
          e.detail.includes('planted a farm')),
    )
    .slice(-20)

  if (milestones.length === 0) {
    return (
      <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>{t('dialogs.stats.noDiscoveries')}</div>
    )
  }

  return (
    <div className="stats-timeline">
      {milestones.map((e, i) => (
        <div key={i} className="stats-timeline-row">
          <span className="stats-tick">
            {t('dialogs.stats.dayShort', { day: formatNumber(Math.floor(e.tick / DAY_LENGTH)) })}
          </span>
          <span className="stats-actor">{e.actor}</span>
          <span className="stats-detail">{e.detail}</span>
        </div>
      ))}
    </div>
  )
}
