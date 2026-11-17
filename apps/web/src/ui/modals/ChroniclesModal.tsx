import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { StoryEntry, HeadlineInfo, WorldState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { Modal } from './Modal'
import { formatNumber, t } from '../../i18n'
import { dayHeading } from '../event-date'
import { requestFreshFrame } from '../../simulation/fresh-frame'
import { chroniclesDefaultTab, type ChroniclesTab } from './chronicles-tab'
import {
  byDay,
  CHRONICLE_FILTERS,
  chronicleTarget,
  inFilter,
  peopleCounts,
  readChronicle,
  type ChronicleEntry,
  type ChronicleFilter,
  type ChronicleKind,
  type PeopleCounts,
} from '../../game/model/chronicle'
import { PixelIcon, type SpriteName } from '../toolbar/ToolSprite'
import { useNerdStats, useUIStore } from '../../state/store'
import { useCameraFocus } from '../../state/camera-focus'
import { tribeFocus } from '../../shared/viewerSelection'
import './stats/stats-story.css'
import './chronicles.css'

type ChronicleWorld = Pick<
  WorldState,
  'lineage_names' | 'settlements' | 'organisms' | 'lineage_sizes' | 'tribe_chronicle'
>

interface Props {
  stories: StoryEntry[]
  headlines?: HeadlineInfo[]
  world?: ChronicleWorld
  onClose: () => void
}

type Tab = ChroniclesTab
type Tone = 'bad' | 'warn' | 'good' | 'news'

const KIND_ICON: Record<ChronicleKind, SpriteName> = {
  war: 'swords',
  peace: 'dove',
  rule: 'crown',
  uprising: 'angry',
  faith: 'plea',
  wonder: 'star',
  build: 'hammer',
  road: 'road',
  ruin: 'fire',
  drought: 'drought',
  winter: 'snowflake',
  plague: 'germ',
  peril: 'v_warning',
  fall: 'skull',
  era: 'bulb',
  sky: 'eclipse',
  festival: 'sparkle',
  generation: 'dna',
  elder: 'v_hourglass',
  death: 'coffin',
  bond: 'ring',
  parting: 'wilt',
  crime: 'coin',
  murder: 'sword',
  deed: 'scroll',
  other: 'book',
}

const KIND_TONE: Partial<Record<ChronicleKind, Tone>> = {
  war: 'bad',
  fall: 'bad',
  ruin: 'bad',
  plague: 'bad',
  peril: 'bad',
  murder: 'bad',
  death: 'bad',
  drought: 'warn',
  winter: 'warn',
  uprising: 'warn',
  crime: 'warn',
  parting: 'warn',
  peace: 'good',
  wonder: 'good',
  build: 'good',
  road: 'good',
  era: 'good',
  festival: 'good',
  generation: 'good',
  bond: 'good',
  elder: 'good',
}

const FILTER_ICON: Record<ChronicleFilter, SpriteName> = {
  all: 'book',
  wars: 'swords',
  rulers: 'crown',
  wonders: 'star',
  disasters: 'fire',
  people: 'tribe',
}

const PEOPLE_KINDS = ['elder', 'death', 'bond', 'parting', 'crime', 'murder'] as const

function entryIcon(entry: ChronicleEntry): SpriteName {
  if (entry.kind === 'road' && /bridge/i.test(entry.text)) return 'bridge'
  if (entry.kind === 'sky') {
    if (/rippled/i.test(entry.text)) return 'aurora'
    if (/stars fell/i.test(entry.text)) return 'comet'
  }
  return KIND_ICON[entry.kind]
}

function peopleLine(counts: PeopleCounts): string {
  return PEOPLE_KINDS.filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => t(`dialogs.chronicles.people.${k}`, { count: formatNumber(counts[k] ?? 0) }))
    .join(' · ')
}

function flyTo(world: ChronicleWorld, entry: ChronicleEntry): boolean {
  const target = chronicleTarget(world, entry)
  if (!target) return false
  const ui = useUIStore.getState()
  if (target.kind === 'tribe') ui.setFocus(tribeFocus(target.lineage, world))
  else if (target.kind === 'person') ui.selectOrg(target.id)
  if (target.at) useCameraFocus.getState().focusTile(Math.round(target.at.x), Math.round(target.at.y))
  return true
}

function Row({
  entry,
  world,
  nerd,
  onGo,
}: {
  entry: ChronicleEntry
  world?: ChronicleWorld
  nerd: boolean
  onGo: () => void
}) {
  const canGo = !!world && !!chronicleTarget(world, entry)
  const body = (
    <>
      <span className="chron-icon" aria-hidden="true">
        <PixelIcon name={entryIcon(entry)} size={16} />
      </span>
      <span className="chron-text">
        {entry.lead && (
          <strong
            className="chron-lead"
            style={entry.lineage ? { color: lineageColor(entry.lineage) } : undefined}
          >
            {entry.lead}{' '}
          </strong>
        )}
        {entry.text}
      </span>
      {nerd && (
        <span className="chron-tick">
          {t('dialogs.chronicles.tick', { tick: formatNumber(entry.tick) })}
          {entry.raw ? ` · ${entry.raw}` : ''}
        </span>
      )}
    </>
  )
  const className = clsx('chron-row', `tone-${KIND_TONE[entry.kind] ?? 'news'}`)
  return (
    <li>
      {canGo ? (
        <button
          type="button"
          className={className}
          title={t('dialogs.chronicles.goThere')}
          onClick={() => {
            if (world && flyTo(world, entry)) onGo()
          }}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}

export function ChroniclesModal({ stories, headlines = [], world, onClose }: Props) {
  useEffect(() => requestFreshFrame(), [])
  const nerd = useNerdStats()
  const chronicle = useMemo(() => readChronicle(stories, headlines), [stories, headlines])
  const [picked, setTab] = useState<Tab | null>(null)
  const [filter, setFilter] = useState<ChronicleFilter>('all')
  const tab = picked ?? chroniclesDefaultTab(chronicle.lives.length, chronicle.history.length)

  const days = useMemo(() => {
    if (tab === 'lives') return byDay(chronicle.lives).map((d) => ({ ...d, people: {} as PeopleCounts }))
    const people = byDay(chronicle.lives.filter((e) => e.kind !== 'deed'))
    const peopleByDay = new Map(people.map((d) => [d.day, peopleCounts(d.entries)]))
    const turns = byDay(chronicle.history.filter((e) => inFilter(e.kind, filter)))
    const showPeople = filter === 'all' || filter === 'people'
    const merged = new Map(turns.map((d) => [d.day, { ...d, people: {} as PeopleCounts }]))
    if (showPeople) {
      for (const d of people) {
        const day = merged.get(d.day) ?? { ...d, entries: [], people: {} }
        day.people = peopleByDay.get(d.day) ?? {}
        merged.set(d.day, day)
      }
    }
    return [...merged.values()].sort((a, b) => b.day - a.day)
  }, [chronicle, tab, filter])

  const tabs: { id: Tab; icon: SpriteName; label: string; count: number }[] = [
    {
      id: 'history',
      icon: 'book',
      label: t('dialogs.chronicles.tabHistory'),
      count: chronicle.history.length,
    },
    { id: 'lives', icon: 'tribe', label: t('dialogs.chronicles.tabLives'), count: chronicle.lives.length },
  ]
  const empty = tab === 'history' ? chronicle.history.length === 0 : chronicle.lives.length === 0

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
        <button aria-label={t('dialogs.chronicles.close')} className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lang-modal-body chron-body">
        <div className="stats-tabs chron-tabs" role="tablist" aria-label={t('dialogs.chronicles.tabsAria')}>
          {tabs.map(({ id, icon, label, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`chron-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="chron-panel"
              className={clsx('stats-tab', tab === id && 'active')}
              onClick={() => setTab(id)}
            >
              <PixelIcon name={icon} size={14} />
              <span>{label}</span>
              {count > 0 && <span className="chron-count">{formatNumber(count)}</span>}
            </button>
          ))}
        </div>
        <div id="chron-panel" role="tabpanel" aria-labelledby={`chron-tab-${tab}`} className="chron-panel">
          <p className="lang-modal-sub chron-intro">
            {tab === 'history' ? t('dialogs.chronicles.historyIntro') : t('dialogs.chronicles.livesIntro')}
          </p>
          {tab === 'history' && !empty && (
            <div className="chron-chips" role="group" aria-label={t('dialogs.chronicles.filtersAria')}>
              {CHRONICLE_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  className={clsx('filter-chip chron-chip', filter === id && 'active')}
                  onClick={() => setFilter(id)}
                >
                  <PixelIcon name={FILTER_ICON[id]} size={12} />
                  {t(`dialogs.chronicles.filters.${id}`)}
                </button>
              ))}
            </div>
          )}
          {empty ? (
            <p className="chron-empty">
              {tab === 'history' ? t('dialogs.chronicles.noHistory') : t('dialogs.chronicles.noLives')}
            </p>
          ) : days.length === 0 ? (
            <p className="chron-empty">{t('dialogs.chronicles.noMatch')}</p>
          ) : (
            days.map((d) => {
              const line = peopleLine(d.people)
              return (
                <section key={d.day} className="chron-day">
                  <h3 className="chron-date">{dayHeading(d.tick)}</h3>
                  <ul className="chron-list">
                    {d.entries.map((entry) => (
                      <Row key={entry.key} entry={entry} world={world} nerd={nerd} onGo={onClose} />
                    ))}
                    {line && (
                      <li>
                        <button
                          type="button"
                          className="chron-row chron-people tone-news"
                          onClick={() => setTab('lives')}
                        >
                          <span className="chron-icon" aria-hidden="true">
                            <PixelIcon name="tribe" size={16} />
                          </span>
                          <span className="chron-text">{line}</span>
                          <span className="chron-more">{t('dialogs.chronicles.seeLives')}</span>
                        </button>
                      </li>
                    )}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
