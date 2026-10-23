import { useState } from 'react'
import type { StoryEntry, HeadlineInfo } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { Modal } from './Modal'
import { formatNumber, t } from '../../i18n'

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
    <Modal
      open
      onClose={onClose}
      className="lang-modal chronicles-modal"
      title={t('dialogs.chronicles.title')}
      hideTitle
    >
      <div className="lang-modal-header">
        <span className="lang-modal-title">{t('dialogs.chronicles.heading')}</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 8 }}>
          {(['history', 'lives'] as Tab[]).map((kind) => (
            <button
              key={kind}
              onClick={() => setTab(kind)}
              style={{
                background: tab === kind ? 'rgba(216,178,112,0.18)' : 'transparent',
                border: `1px solid ${tab === kind ? 'rgba(216,178,112,0.5)' : '#2a2520'}`,
                color: tab === kind ? '#e0c98f' : '#998',
                padding: '3px 10px',
                borderRadius: 3,
                fontSize: 10,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {kind === 'history' ? t('dialogs.chronicles.tabHistory') : t('dialogs.chronicles.tabLives')}
            </button>
          ))}
        </div>
        <button aria-label={t('dialogs.chronicles.close')} className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lang-modal-body">
        {tab === 'history' ? (
          <>
            <p className="lang-modal-sub">{t('dialogs.chronicles.historyIntro')}</p>
            {timeline.length === 0 ? (
              <div className="lang-no-stories">{t('dialogs.chronicles.noHistory')}</div>
            ) : (
              <div className="chronicle-list">
                {timeline.map((h, i) => (
                  <div key={`${h.tick}-${i}`} className="chronicle-row">
                    <span className="chronicle-day">
                      {t('dialogs.chronicles.day', { day: formatNumber(Math.floor(h.tick / DAY_LENGTH)) })}
                    </span>
                    <span className="chronicle-text">{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="lang-modal-sub">{t('dialogs.chronicles.livesIntro')}</p>
            {sortedStories.length === 0 ? (
              <div className="lang-no-stories">{t('dialogs.chronicles.noLives')}</div>
            ) : (
              <div className="chronicle-list">
                {sortedStories.map((s, i) => (
                  <div key={i} className="chronicle-row">
                    <span className="chronicle-day">
                      {t('dialogs.chronicles.day', { day: formatNumber(Math.floor(s.tick / DAY_LENGTH)) })}
                    </span>
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
