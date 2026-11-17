import type { ReactNode } from 'react'
import type { WorldState } from '../../../shared/types'
import { deathCauses, ideasKnown, traitLevel } from '../../../game/model/stats-story'
import { discoveryWord } from '../../sim-words'
import { formatNumber, t, type MessageKey } from '../../../i18n'
import { Tooltip } from '../../toolbar/Tooltip'

export function StatSection({
  title,
  tip,
  wide,
  children,
}: {
  title: string
  tip?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section className={wide ? 'stats-story-section wide' : 'stats-story-section'}>
      <div className="stats-section-title stats-story-title">
        <span>{title}</span>
        {tip && (
          <Tooltip tip={tip}>
            <span className="stats-info" role="img" aria-label={tip} tabIndex={0}>
              i
            </span>
          </Tooltip>
        )}
      </div>
      {children}
    </section>
  )
}

const TRAITS: { key: keyof NonNullable<WorldState['organisms'][number]['traits']>; label: MessageKey }[] = [
  { key: 'curiosity', label: 'dialogs.stats.traits.curiosity' },
  { key: 'social_tendency', label: 'dialogs.stats.traits.socialTendency' },
  { key: 'resilience', label: 'dialogs.stats.traits.resilience' },
  { key: 'fear', label: 'dialogs.stats.traits.fear' },
  { key: 'aggression', label: 'dialogs.stats.traits.aggression' },
  { key: 'memory_strength', label: 'dialogs.stats.traits.memoryStrength' },
]

function traitAverages(organisms: WorldState['organisms']): { label: MessageKey; value: number }[] | null {
  let n = 0
  const sums = new Map<string, number>()
  for (const o of organisms) {
    if (!o.alive || !o.traits) continue
    n++
    for (const { key } of TRAITS) sums.set(key, (sums.get(key) ?? 0) + (o.traits[key] ?? 0))
  }
  if (n === 0) return null
  return TRAITS.map(({ key, label }) => ({ label, value: (sums.get(key) ?? 0) / n }))
}

export function TraitWords({ organisms }: { organisms: WorldState['organisms'] }) {
  const rows = traitAverages(organisms)
  if (!rows) return null
  return (
    <div className="stats-traits">
      {rows.map(({ label, value }) => {
        const level = traitLevel(value)
        return (
          <div key={label} className="stats-trait">
            <span className="stats-trait-name">{t(label)}</span>
            <span className="stats-trait-meter" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i <= LEVEL_INDEX[level] ? 'on' : undefined} />
              ))}
            </span>
            <span className={`stats-trait-level level-${level}`}>{t(`dialogs.stats.level.${level}`)}</span>
          </div>
        )
      })}
    </div>
  )
}

const LEVEL_INDEX = { veryLow: 0, low: 1, average: 2, high: 3, veryHigh: 4 } as const

const CAUSE_LABEL: Record<string, MessageKey> = {
  oldAge: 'panels.history.oldAge',
  starvation: 'panels.history.starvation',
  dehydration: 'dialogs.stats.causes.dehydration',
  sickness: 'panels.history.sickness',
  combat: 'panels.history.combat',
  beasts: 'panels.history.beasts',
  drowned: 'panels.history.drowned',
  fire: 'panels.history.fire',
  disaster: 'panels.history.disaster',
}

export function DeathCauses({ history }: { history: WorldState['history'] }) {
  const rows = deathCauses(history as unknown as Record<string, unknown>)
  if (rows.length === 0) return null
  const total = rows.reduce((n, r) => n + r.count, 0)
  return (
    <div className="stats-bars">
      {rows.map((r) => (
        <div key={r.cause} className="stats-bar-row">
          <span className="stats-bar-label">{t(CAUSE_LABEL[r.cause]!)}</span>
          <span className="stats-bar-track" aria-hidden="true">
            <span className="stats-bar-fill" style={{ width: `${Math.max(3, (r.count / total) * 100)}%` }} />
          </span>
          <span className="stats-bar-value">{formatNumber(r.count)}</span>
        </div>
      ))}
    </div>
  )
}

export function IdeaChips({ organisms, limit = 12 }: { organisms: WorldState['organisms']; limit?: number }) {
  const ideas = ideasKnown(organisms).slice(0, limit)
  if (ideas.length === 0) return null
  return (
    <ul className="stats-ideas">
      {ideas.map((idea) => (
        <li key={idea.id} className="stats-idea">
          <span className="stats-idea-name">{discoveryWord(idea.id)}</span>
          <span className="stats-idea-share">
            {t('dialogs.stats.ideaShare', { percent: formatNumber(Math.round(idea.share * 100)) })}
          </span>
        </li>
      ))}
    </ul>
  )
}
