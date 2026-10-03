import type { WorldState } from '../../types'

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
            <span className="trait-label">{k.replace('_', ' ')}</span>
            <div className="trait-bar-wrap">
              <div className="trait-bar" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="trait-val">{v.toFixed(2)}</span>
          </div>
        )
      })}
    </div>
  )
}
