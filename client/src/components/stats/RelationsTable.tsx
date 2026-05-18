import { useMemo } from 'react'
import type { TribalRelation } from '../../types'
import { lineageColor } from '../../constants'

export function RelationsTable({ relations, lineageSizes }: {
  relations: TribalRelation[]
  lineageSizes: { id: string; count: number }[]
}) {
  const sizeMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const { id, count } of lineageSizes) m[id] = count
    return m
  }, [lineageSizes])

  const sorted = [...relations].sort((a, b) => Math.abs(b.attitude) - Math.abs(a.attitude))

  if (sorted.length === 0) {
    return <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>
      no inter-tribe contacts yet
    </div>
  }

  return (
    <div className="stats-relations">
      {sorted.slice(0, 12).map((r, i) => {
        const barW = Math.abs(r.attitude) * 80
        const barColor = r.attitude > 0.3 ? '#55cc88' : r.attitude < -0.3 ? '#cc4444' : '#666'
        return (
          <div key={i} className="stats-rel-row">
            <span style={{ color: lineageColor(r.a), fontFamily: 'monospace', fontSize: 10 }}>{r.a}</span>
            <span style={{ color: '#333', fontSize: 9, margin: '0 4px' }}>↔</span>
            <span style={{ color: lineageColor(r.b), fontFamily: 'monospace', fontSize: 10 }}>{r.b}</span>
            <div className="stats-rel-bar-wrap">
              <div className="stats-rel-bar"
                style={{ width: barW, background: barColor, opacity: 0.8 }} />
            </div>
            <span className={`stats-rel-status status-${r.status}`}>{r.status}</span>
            <span style={{ color: '#333', fontSize: 9, marginLeft: 6 }}>
              {sizeMap[r.a] ?? '?'} vs {sizeMap[r.b] ?? '?'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
