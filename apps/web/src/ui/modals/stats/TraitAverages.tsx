import type { WorldState } from '../../../shared/types'
import { formatNumber, t, type MessageKey } from '../../../i18n'

const TRAIT_LABEL: Record<string, MessageKey> = {
  curiosity: 'dialogs.stats.traits.curiosity',
  fear: 'dialogs.stats.traits.fear',
  social_tendency: 'dialogs.stats.traits.socialTendency',
  resilience: 'dialogs.stats.traits.resilience',
  aggression: 'dialogs.stats.traits.aggression',
  memory_strength: 'dialogs.stats.traits.memoryStrength',
}

export function TraitAverages({ organisms }: { organisms: WorldState['organisms'] }) {
  if (organisms.length === 0) return null
  const keys = [
    'curiosity',
    'fear',
    'social_tendency',
    'resilience',
    'aggression',
    'memory_strength',
  ] as const
  const sums: Record<string, number> = {}
  let n = 0
  for (const o of organisms) {
    if (!o.traits) continue
    n++
    for (const k of keys) sums[k] = (sums[k] ?? 0) + o.traits[k]
  }
  if (n === 0) return null
  return (
    <div className="trait-avgs">
      {keys.map((k) => {
        const v = (sums[k] ?? 0) / n
        return (
          <div key={k} className="trait-row">
            <span className="trait-label">{t(TRAIT_LABEL[k])}</span>
            <div className="trait-bar-wrap">
              <div className="trait-bar" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="trait-val">
              {formatNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
