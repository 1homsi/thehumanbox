import { useState } from 'react'
import type { StoryEntry, HeadlineInfo } from '../types'
import { lineageColor } from '../utils/constants'
import { Modal } from './Modal'

const DAY_LENGTH = 600

interface Props {
  stories: StoryEntry[]
  headlines?: HeadlineInfo[]
  onClose: () => void
}

type Tab = 'history' | 'lives'

export function ChroniclesModal({ stories, headlines = [], onClose }: Props) {
  const [tab, setTab] = useState<Tab>('history')
  const sortedStories = [...stories]
  // Headlines arrive newest-first; show as a descending timeline.
  const timeline = [...headlines]

  return (
    <Modal open onClose={onClose} className="lang-modal chronicles-modal" title="Chronicles" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">CHRONICLES</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 8 }}>
          {(['history', 'lives'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(216,178,112,0.18)' : 'transparent',
                border: `1px solid ${tab === t ? 'rgba(216,178,112,0.5)' : '#2a2520'}`,
                color: tab === t ? '#e0c98f' : '#998',
                padding: '3px 10px',
                borderRadius: 3,
                fontSize: 10,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {t === 'history' ? 'World History' : 'Lives'}
            </button>
          ))}
        </div>
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lang-modal-body">
        {tab === 'history' ? (
          <>
            <p className="lang-modal-sub">
              The great turns of this world — eras, wars, dynasties and wonders.
            </p>
            {timeline.length === 0 ? (
              <div className="lang-no-stories">No notable events yet. The story is just beginning.</div>
            ) : (
              <div className="chronicle-list">
                {timeline.map((h, i) => (
                  <div key={`${h.tick}-${i}`} className="chronicle-row">
                    <span className="chronicle-day">day {Math.floor(h.tick / DAY_LENGTH)}</span>
                    <span className="chronicle-text">{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="lang-modal-sub">
              Stories told by the world's inhabitants, ordered by when they were lived.
            </p>
            {sortedStories.length === 0 ? (
              <div className="lang-no-stories">
                No stories yet. Stories appear after organisms complete a full day cycle.
              </div>
            ) : (
              <div className="chronicle-list">
                {sortedStories.map((s, i) => (
                  <div key={i} className="chronicle-row">
                    <span className="chronicle-day">day {Math.floor(s.tick / DAY_LENGTH)}</span>
                    <span className="chronicle-name" style={{ color: lineageColor(s.lineage_id) }}>
                      {s.org_name}
                    </span>
                    <span className="chronicle-text">{s.story}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
