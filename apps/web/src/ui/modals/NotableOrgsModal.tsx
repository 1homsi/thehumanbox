import { personName } from '../../shared/personName'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Modal, ModalHeader } from './Modal'
import { PixelIcon, type SpriteName } from '../toolbar/ToolSprite'
import type { OrganismState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useUIStore } from '../../state/store'
import { shownGeneration } from '../../game/model/generations'
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
  icon: SpriteName
  scoreOf: (o: OrganismState) => number
  format: (o: OrganismState) => string
  filter?: (o: OrganismState) => boolean
}> = [
  {
    id: 'oldest',
    label: 'dialogs.notable.oldest',
    icon: 'v_hourglass',
    scoreOf: (o) => o.age,
    format: (o) => t('dialogs.notable.days', { count: formatNumber(Math.floor(o.age / DAY_LENGTH)) }),
    filter: (o) => o.alive,
  },
  {
    id: 'children',
    label: 'dialogs.notable.children',
    icon: 'family',
    scoreOf: (o) => o.children_count ?? 0,
    format: (o) => t('dialogs.notable.childrenCount', { count: formatNumber(o.children_count ?? 0) }),
    filter: (o) => (o.children_count ?? 0) > 0,
  },
  {
    id: 'friends',
    label: 'dialogs.notable.friends',
    icon: 'tribe',
    scoreOf: (o) => Object.keys(o.friends ?? {}).length,
    format: (o) =>
      t('dialogs.notable.friendsCount', { count: formatNumber(Object.keys(o.friends ?? {}).length) }),
    filter: (o) => o.alive && Object.keys(o.friends ?? {}).length > 0,
  },
  {
    id: 'wealth',
    label: 'dialogs.notable.wealth',
    icon: 'coin',
    scoreOf: (o) => o.wealth ?? 0,
    format: (o) => t('dialogs.notable.coin', { count: formatNumber(o.wealth ?? 0) }),
    filter: (o) => o.alive && (o.wealth ?? 0) > 0,
  },
  {
    id: 'discoveries',
    label: 'dialogs.notable.discoveries',
    icon: 'search',
    scoreOf: (o) => (o.discoveries ?? []).length,
    format: (o) =>
      t('dialogs.notable.discoveriesCount', { count: formatNumber((o.discoveries ?? []).length) }),
    filter: (o) => o.alive && (o.discoveries ?? []).length > 0,
  },
  {
    id: 'literacy',
    label: 'dialogs.notable.literate',
    icon: 'scroll',
    scoreOf: (o) => o.literacy ?? 0,
    format: (o) =>
      t('dialogs.notable.literacy', { percent: formatNumber(Math.round((o.literacy ?? 0) * 100)) }),
    filter: (o) => o.alive && (o.literacy ?? 0) > 0.05,
  },
  {
    id: 'piety',
    label: 'dialogs.notable.devout',
    icon: 'dove',
    scoreOf: (o) => o.piety ?? 0,
    format: (o) => t('dialogs.notable.piety', { percent: formatNumber(Math.round((o.piety ?? 0) * 100)) }),
    filter: (o) => o.alive && (o.piety ?? 0) > 0.05,
  },
  {
    id: 'joy',
    label: 'dialogs.notable.joy',
    icon: 'sun',
    scoreOf: (o) => o.joy_ticks ?? 0,
    format: (o) => t('dialogs.notable.joyTicks', { count: formatNumber(o.joy_ticks ?? 0) }),
    filter: (o) => o.alive && (o.joy_ticks ?? 0) > 0,
  },
  {
    id: 'grief',
    label: 'dialogs.notable.grief',
    icon: 'drop',
    scoreOf: (o) => o.grief_ticks ?? 0,
    format: (o) => t('dialogs.notable.griefTicks', { count: formatNumber(o.grief_ticks ?? 0) }),
    filter: (o) => o.alive && (o.grief_ticks ?? 0) > 0,
  },
  {
    id: 'aspiration',
    label: 'dialogs.notable.aspiration',
    icon: 'star',
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
      <ModalHeader
        title={t('dialogs.notable.heading')}
        sub={t('dialogs.notable.alive', { count: formatNumber(livingCount) })}
        onClose={onClose}
        closeLabel={t('dialogs.notable.close')}
      />

      <div className="notable-lenses">
        {CATEGORIES.map((cat) => {
          const isActive = activeCat === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              className={clsx('filter-chip notable-lens', isActive && 'active')}
              aria-pressed={isActive}
              onClick={() => setActiveCat(cat.id)}
            >
              <PixelIcon name={cat.icon} size={12} />
              {t(cat.label)}
            </button>
          )
        })}
      </div>

      <div className="thb-modal-body notable-body">
        {rows.length === 0 ? (
          <div className="notable-empty">{t('dialogs.notable.empty')}</div>
        ) : (
          <div className="notable-list">
            {rows.map((r, i) => {
              const color = lineageColor(r.org.lineage_id)
              return (
                <button
                  key={r.org.id}
                  onClick={() => {
                    selectOrg(r.org.id)
                    onClose()
                  }}
                  type="button"
                  className="notable-row"
                  style={{ borderLeftColor: color }}
                >
                  <span className="notable-rank">{(i + 1).toString().padStart(2, '0')}</span>
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
                    <span className="notable-gen">
                      {t('dialogs.notable.gen', { gen: shownGeneration(r.org.generation) })}
                    </span>
                    {!r.org.alive && <span style={{ color: '#444', marginLeft: 6 }}>†</span>}
                  </span>
                  <span className="notable-value">{r.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
