import type { StoryEntry } from '../types'
import { lineageColor } from '../utils/constants'
import { Modal } from './Modal'

const DAY_LENGTH = 600

interface Props {
  stories: StoryEntry[]
  onClose: () => void
}

export function ChroniclesModal({ stories, onClose }: Props) {
  const sorted = [...stories]

  return (
    <Modal open onClose={onClose} className="lang-modal chronicles-modal" title="Chronicles" hideTitle>
      <div className="lang-modal-header">
          <span className="lang-modal-title">CHRONICLES</span>
          <button aria-label="Close" className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="lang-modal-body">
          <p className="lang-modal-sub">
            Stories told by the world's inhabitants, ordered by when they were lived.
          </p>

          {sorted.length === 0 ? (
            <div className="lang-no-stories">
              No stories yet. Stories appear after organisms complete a full day cycle.
            </div>
          ) : (
            <div className="chronicle-list">
              {sorted.map((s, i) => (
                <div key={i} className="chronicle-row">
                  <span className="chronicle-day">day {Math.floor(s.tick / DAY_LENGTH)}</span>
                  <span
                    className="chronicle-name"
                    style={{ color: lineageColor(s.lineage_id) }}
                  >
                    {s.org_name}
                  </span>
                  <span className="chronicle-text">{s.story}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  )
}
