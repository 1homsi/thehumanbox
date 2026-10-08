import { useMemo } from 'react'
import { achievementsFor } from '../../game/model/achievements'
import type { WorldState } from '../../shared/types'
import { Modal } from './Modal'

interface Props {
  world: WorldState
  onClose: () => void
}

/** What the world has achieved so far. Read live from the world, so nothing here is saved or replayed. */
export function AchievementsModal({ world, onClose }: Props) {
  const list = useMemo(
    () => achievementsFor({ tick: world.tick, organisms: world.organisms, settlements: world.settlements }),
    [world.tick, world.organisms, world.settlements],
  )
  const earned = list.filter((a) => a.unlocked).length

  return (
    <Modal open onClose={onClose} className="achievements-modal" title="Achievements" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">ACHIEVEMENTS</span>
        <span className="tree-modal-sub">
          {earned} of {list.length} earned
        </span>
      </div>
      <ul className="achievement-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {list.map((a) => (
          <li
            key={a.id}
            data-unlocked={a.unlocked}
            style={{
              display: 'flex',
              gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid #3a3020',
              opacity: a.unlocked ? 1 : 0.6,
            }}
          >
            <span aria-hidden="true" style={{ width: 18, color: a.unlocked ? '#e8b060' : '#666' }}>
              {a.unlocked ? '★' : '☆'}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: a.unlocked ? '#f4e6c0' : '#a09070' }}>{a.title}</span>
              <span className="tree-modal-sub">{a.detail}</span>
              {!a.unlocked && a.progress && <span className="tree-modal-sub">{a.progress}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
