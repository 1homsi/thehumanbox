import { useMemo, useState } from 'react'
import type { WorldState } from '../../types'

export function DiscoveryRollup({ organisms }: { organisms: WorldState['organisms'] }) {
  const [showAll, setShowAll] = useState(false)
  const TOP_N = 18
  const { rows, totalDistinct } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of organisms) for (const d of o.discoveries ?? []) counts[d] = (counts[d] ?? 0) + 1
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return { rows: sorted, totalDistinct: sorted.length }
  }, [organisms])

  if (rows.length === 0) {
    return <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>no discoveries yet</div>
  }
  const visible = showAll ? rows : rows.slice(0, TOP_N)
  return (
    <div className="disc-rollup">
      <div className="disc-summary">
        <span>
          {totalDistinct} distinct · top {Math.min(TOP_N, totalDistinct)} shown
        </span>
        {totalDistinct > TOP_N && (
          <button className="disc-toggle" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'collapse' : `show all (${totalDistinct})`}
          </button>
        )}
      </div>
      <div className="disc-list">
        {visible.map(([name, count]) => (
          <div key={name} className="disc-row">
            <span className="disc-name">{name}</span>
            <span className="disc-count">{count}</span>
            <span className="disc-pct">{Math.round((count / organisms.length) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
