import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
 * The naive `useWorldStore(s => s.world?.organisms)` subscription
 * re-renders every tick because each organism gets a fresh reference
 * via the merge layer. Instead, derive a flat `Record<lineage_id, stamp>`
 * where `stamp` encodes (count, minGen, maxGen) as a comma-separated
 * string. `useShallow` then catches the common case where no lineage
 * count or generation envelope changed and short-circuits the
 * re-render entirely.
 */
function LineagesListImpl() {
  const openAllLineages = useUIStore((s) => s.openAllLineages)
  const focus    = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const stamps = useWorldStore(
    useShallow((s) => {
      const out: Record<string, string> = {}
      if (!s.world) return out
      for (const o of s.world.organisms) {
        if (!o.alive || !o.lineage_id) continue
        const cur = out[o.lineage_id]
        if (!cur) {
          out[o.lineage_id] = `1,${o.generation},${o.generation}`
        } else {
          const [c, mn, mx] = cur.split(',').map(Number)
          const newMn = o.generation < mn ? o.generation : mn
          const newMx = o.generation > mx ? o.generation : mx
          out[o.lineage_id] = `${c + 1},${newMn},${newMx}`
        }
      }
      return out
    }),
  )
  const lineageNames = useWorldStore((s) => s.world?.lineage_names)

  const rows = useMemo((): LineageRow[] => {
    const out: LineageRow[] = []
    for (const lid in stamps) {
      const [count, minGen, maxGen] = stamps[lid].split(',').map(Number)
      out.push({
        id:     lid,
        name:   lineageNames?.[lid] ?? lid.slice(0, 6),
        count,
        minGen,
        maxGen,
      })
    }
    return out.sort((a, b) => b.count - a.count)
  }, [stamps, lineageNames])

  return (
    <>
      <div className="section-title">LINEAGES ({rows.length})</div>
      <div className="lineage-list">
        {rows.slice(0, 5).map((r) => {
          const active = focus === `lineage:${r.id}`
          return (
            <button
              key={r.id}
              type="button"
              className={'lineage-row' + (active ? ' active' : '')}
              onClick={() => setFocus(active ? 'all' : `lineage:${r.id}`)}
              aria-pressed={active}
              title={active ? 'Show all lineages' : `Focus ${r.name}`}
            >
              <span className="lineage-dot" style={{ background: lineageColor(r.id) }} />
              <span className="lineage-id">{r.name}</span>
              <span className="lineage-count">{r.count}</span>
              <span className="lineage-gen">
                g{r.minGen}{r.maxGen > r.minGen ? `-${r.maxGen}` : ''}
              </span>
            </button>
          )
        })}
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
