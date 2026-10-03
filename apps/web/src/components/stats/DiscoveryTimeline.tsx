import type { WorldState } from '../../types'
import { DAY_LENGTH } from './constants'

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
    return <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>no discoveries yet</div>
  }

  return (
    <div className="stats-timeline">
      {milestones.map((e, i) => (
        <div key={i} className="stats-timeline-row">
          <span className="stats-tick">d{Math.floor(e.tick / DAY_LENGTH)}</span>
          <span className="stats-actor">{e.actor}</span>
          <span className="stats-detail">{e.detail}</span>
        </div>
      ))}
    </div>
  )
}
