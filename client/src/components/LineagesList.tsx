import { memo, useMemo } from 'react'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { useWorldStore } from '../stores/worldStore'

interface LineageRow {
  id: string
  name: string
  count: number
  minGen: number
  maxGen: number
}

/**
 * Sidebar lineages panel. Subscribes only to world.organisms +
 * lineage_names and derives rows in a useMemo. Re-renders at the
 * world-store publish cadence (2 Hz throttled), but in isolation - a
 * change to events or history won't trigger a render here.
 */
function LineagesListImpl() {
  const openAllLineages = useUIStore((s) => s.openAllLineages)
  const organisms    = useWorldStore((s) => s.world?.organisms)
  const lineageNames = useWorldStore((s) => s.world?.lineage_names)

  const rows = useMemo((): LineageRow[] => {
    if (!organisms) return []
    const buckets: Record<string, LineageRow> = {}
    for (const o of organisms) {
      if (!o.alive || !o.lineage_id) continue
      const r = buckets[o.lineage_id]
      if (!r) {
        buckets[o.lineage_id] = {
          id:     o.lineage_id,
          name:   lineageNames?.[o.lineage_id] ?? o.lineage_id.slice(0, 6),
          count:  1,
          minGen: o.generation,
          maxGen: o.generation,
        }
      } else {
        r.count++
        if (o.generation < r.minGen) r.minGen = o.generation
        if (o.generation > r.maxGen) r.maxGen = o.generation
      }
    }
    return Object.values(buckets).sort((a, b) => b.count - a.count)
  }, [organisms, lineageNames])

  return (
    <>
      <div className="section-title">LINEAGES ({rows.length})</div>
      <div className="lineage-list">
        {rows.slice(0, 5).map((r) => (
          <div key={r.id} className="lineage-row">
            <span className="lineage-dot" style={{ background: lineageColor(r.id) }} />
            <span className="lineage-id">{r.name}</span>
            <span className="lineage-count">{r.count}</span>
            <span className="lineage-gen">
              g{r.minGen}{r.maxGen > r.minGen ? `-${r.maxGen}` : ''}
            </span>
          </div>
        ))}
        {rows.length > 5 && (
          <button className="view-all-btn" onClick={openAllLineages}>
            view all ({rows.length})
          </button>
        )}
      </div>
    </>
  )
}

export const LineagesList = memo(LineagesListImpl)
