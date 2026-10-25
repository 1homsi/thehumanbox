import { useMemo } from 'react'
import type { TribalRelation } from '../../../shared/types'
import { lineageColor } from '../../../shared/constants'
import { t } from '../../../i18n'
import { knownTribeName } from '../../../state/worldStore'
import { relationWord } from '../../sim-words'

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
    return <div className="stats-rel-empty">{t('dialogs.stats.noContacts')}</div>
  }

  return (
    <div className="stats-relations">
      {sorted.slice(0, 12).map((r, i) => {
        const barW = Math.abs(r.attitude) * 80
        const barColor = r.attitude > 0.3 ? '#8fd06a' : r.attitude < -0.3 ? '#d8463a' : 'var(--px-muted)'
        return (
          <div key={i} className="stats-rel-row">
            <span className="stats-rel-name" style={{ color: lineageColor(r.a) }}>
              {knownTribeName(lineageNames, r.a) ?? r.a.slice(0, 6)}
            </span>
            <span className="stats-rel-muted">↔</span>
            <span className="stats-rel-name" style={{ color: lineageColor(r.b) }}>
              {knownTribeName(lineageNames, r.b) ?? r.b.slice(0, 6)}
            </span>
            <div className="stats-rel-bar-wrap">
              <div className="stats-rel-bar" style={{ width: barW, background: barColor }} />
            </div>
            <span className={`stats-rel-status status-${r.status}`}>{relationWord(r.status)}</span>
            <span className="stats-rel-muted">
              {t('dialogs.stats.versus', { a: sizeMap[r.a] ?? 0, b: sizeMap[r.b] ?? 0 })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
