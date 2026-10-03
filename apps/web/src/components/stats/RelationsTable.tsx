import { useMemo } from 'react'
import type { TribalRelation } from '../../types'
import { lineageColor } from '../../utils/constants'

export function RelationsTable({
  relations,
  lineageSizes,
  lineageNames = {},
}: {
  relations: TribalRelation[]
  lineageSizes: { id: string; count: number }[]
  lineageNames?: Record<string, string>
}) {
  const sizeMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const { id, count } of lineageSizes) m[id] = count
    return m
  }, [lineageSizes])

  const sorted = [...relations].sort((a, b) => Math.abs(b.attitude) - Math.abs(a.attitude))

  if (sorted.length === 0) {
    return <div className="stats-rel-empty">no inter-tribe contacts yet</div>
  }

  return (
    <div className="stats-relations">
      {sorted.slice(0, 12).map((r, i) => {
        const barW = Math.abs(r.attitude) * 80
        const barColor = r.attitude > 0.3 ? '#8fd06a' : r.attitude < -0.3 ? '#d8463a' : 'var(--px-muted)'
        return (
          <div key={i} className="stats-rel-row">
            <span className="stats-rel-name" style={{ color: lineageColor(r.a) }}>
              {lineageNames[r.a] ?? r.a}
            </span>
            <span className="stats-rel-muted">↔</span>
            <span className="stats-rel-name" style={{ color: lineageColor(r.b) }}>
              {lineageNames[r.b] ?? r.b}
            </span>
            <div className="stats-rel-bar-wrap">
              <div className="stats-rel-bar" style={{ width: barW, background: barColor }} />
            </div>
            <span className={`stats-rel-status status-${r.status}`}>{r.status}</span>
            <span className="stats-rel-muted">
              {sizeMap[r.a] ?? '?'} vs {sizeMap[r.b] ?? '?'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
