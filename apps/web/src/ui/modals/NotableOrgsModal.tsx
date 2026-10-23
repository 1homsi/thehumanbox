import { personName } from '../../shared/personName'
import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import type { OrganismState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useUIStore } from '../../state/store'
import { formatNumber, t, type MessageKey } from '../../i18n'

const DAY_LENGTH = 600

type Category =
  | 'oldest'
  | 'children'
  | 'friends'
  | 'wealth'
  | 'discoveries'
  | 'literacy'
  | 'piety'
  | 'joy'
  | 'grief'
  | 'aspiration'

interface Props {
  organisms: OrganismState[]
  onClose: () => void
}

const CATEGORIES: Array<{
  id: Category
  label: MessageKey
  emoji: string
  scoreOf: (o: OrganismState) => number
  format: (o: OrganismState) => string
  filter?: (o: OrganismState) => boolean
}> = [
  {
    id: 'oldest',
    label: 'dialogs.notable.oldest',
    emoji: '⌛',
    scoreOf: (o) => o.age,
    format: (o) => t('dialogs.notable.days', { count: formatNumber(Math.floor(o.age / DAY_LENGTH)) }),
    filter: (o) => o.alive,
  },
  {
    id: 'children',
    label: 'dialogs.notable.children',
    emoji: '🍼',
    scoreOf: (o) => o.children_count ?? 0,
    format: (o) => t('dialogs.notable.childrenCount', { count: formatNumber(o.children_count ?? 0) }),
    filter: (o) => (o.children_count ?? 0) > 0,
  },
  {
    id: 'friends',
    label: 'dialogs.notable.friends',
    emoji: '🤝',
    scoreOf: (o) => Object.keys(o.friends ?? {}).length,
    format: (o) =>
      t('dialogs.notable.friendsCount', { count: formatNumber(Object.keys(o.friends ?? {}).length) }),
    filter: (o) => o.alive && Object.keys(o.friends ?? {}).length > 0,
  },
  {
    id: 'wealth',
    label: 'dialogs.notable.wealth',
    emoji: '💰',
    scoreOf: (o) => o.wealth ?? 0,
    format: (o) => t('dialogs.notable.coin', { count: formatNumber(o.wealth ?? 0) }),
    filter: (o) => o.alive && (o.wealth ?? 0) > 0,
  },
  {
    id: 'discoveries',
    label: 'dialogs.notable.discoveries',
    emoji: '🔎',
    scoreOf: (o) => (o.discoveries ?? []).length,
    format: (o) =>
      t('dialogs.notable.discoveriesCount', { count: formatNumber((o.discoveries ?? []).length) }),
    filter: (o) => o.alive && (o.discoveries ?? []).length > 0,
  },
  {
    id: 'literacy',
    label: 'dialogs.notable.literate',
    emoji: '📜',
    scoreOf: (o) => o.literacy ?? 0,
    format: (o) =>
      t('dialogs.notable.literacy', { percent: formatNumber(Math.round((o.literacy ?? 0) * 100)) }),
    filter: (o) => o.alive && (o.literacy ?? 0) > 0.05,
  },
  {
    id: 'piety',
    label: 'dialogs.notable.devout',
    emoji: '🕯️',
    scoreOf: (o) => o.piety ?? 0,
    format: (o) => t('dialogs.notable.piety', { percent: formatNumber(Math.round((o.piety ?? 0) * 100)) }),
    filter: (o) => o.alive && (o.piety ?? 0) > 0.05,
  },
  {
    id: 'joy',
    label: 'dialogs.notable.joy',
    emoji: '☀',
    scoreOf: (o) => o.joy_ticks ?? 0,
    format: (o) => t('dialogs.notable.joyTicks', { count: formatNumber(o.joy_ticks ?? 0) }),
    filter: (o) => o.alive && (o.joy_ticks ?? 0) > 0,
  },
  {
    id: 'grief',
    label: 'dialogs.notable.grief',
    emoji: '◌',
    scoreOf: (o) => o.grief_ticks ?? 0,
    format: (o) => t('dialogs.notable.griefTicks', { count: formatNumber(o.grief_ticks ?? 0) }),
    filter: (o) => o.alive && (o.grief_ticks ?? 0) > 0,
  },
  {
    id: 'aspiration',
    label: 'dialogs.notable.aspiration',
    emoji: '✦',
    scoreOf: (o) => o.age,
    format: (o) => o.aspiration ?? '',
    filter: (o) => o.alive && !!o.aspiration && o.aspiration.length > 0,
  },
]

export function NotableOrgsModal({ organisms, onClose }: Props) {
  const [activeCat, setActiveCat] = useState<Category>('oldest')
  const selectOrg = useUIStore((s) => s.selectOrg)

  const rows = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === activeCat)!
    const pool = cat.filter ? organisms.filter(cat.filter) : organisms
    const sorted = [...pool].sort((a, b) => cat.scoreOf(b) - cat.scoreOf(a))
    return sorted.slice(0, 20).map((o) => ({ org: o, label: cat.format(o) }))
  }, [organisms, activeCat])

  const livingCount = useMemo(() => organisms.filter((o) => o.alive).length, [organisms])

  return (
    <Modal open onClose={onClose} className="notable-modal" title={t('dialogs.notable.title')} hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">{t('dialogs.notable.heading')}</span>
        <span className="tree-modal-sub">
          {t('dialogs.notable.alive', { count: formatNumber(livingCount) })}
        </span>
        <div className="modal-header-actions">
          <button aria-label={t('dialogs.notable.close')} className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px',
          flexWrap: 'wrap',
          borderBottom: '1px solid #1a1612',
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeCat === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              style={{
                background: isActive ? '#2a2218' : 'transparent',
                border: `1px solid ${isActive ? '#d8a060' : '#2a2520'}`,
                color: isActive ? '#f0d088' : '#888',
                padding: '5px 10px',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              {cat.emoji} {t(cat.label)}
            </button>
          )
        })}
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 140px)', padding: '8px 12px' }}>
        {rows.length === 0 ? (
          <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center', padding: 40 }}>
            {t('dialogs.notable.empty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((r, i) => {
              const color = lineageColor(r.org.lineage_id)
              return (
                <button
                  key={r.org.id}
                  onClick={() => {
                    selectOrg(r.org.id)
                    onClose()
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '30px 1fr auto',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderLeft: `3px solid ${color}`,
                    color: '#d0c8c0',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1a1612'
                    e.currentTarget.style.borderColor = '#3a3028'
                    e.currentTarget.style.borderLeftColor = color
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.borderLeftColor = color
                  }}
                >
                  <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 11 }}>
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <span>
                    <span style={{ color, fontWeight: 600 }}>{personName(r.org)}</span>
                    {r.org.is_elder && <span style={{ color: '#ffcf6a', marginLeft: 6 }}>◈</span>}
                    {r.org.sex && (
                      <span
                        style={{
                          color: r.org.sex === 'female' ? '#e09ab0' : '#7ab0e0',
                          marginLeft: 8,
                          fontSize: 10,
                          opacity: 0.7,
                        }}
                      >
                        {r.org.sex === 'female' ? '♀' : '♂'}
                      </span>
                    )}
                    <span style={{ color: '#555', marginLeft: 8, fontSize: 10 }}>
                      {t('dialogs.notable.gen', { gen: r.org.generation })}
                    </span>
                    {!r.org.alive && <span style={{ color: '#444', marginLeft: 6 }}>†</span>}
                  </span>
                  <span style={{ color: '#9a8870', fontSize: 11, fontFamily: 'monospace' }}>{r.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
