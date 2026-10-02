import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { useWorldStore } from '../stores/worldStore'
import { PERIL_HELP, remainingLine, visibleLineages } from '../world/tribe-peril'
import type { PerilCause } from '../types'

interface LineageRow {
  id: string
  name: string
  count: number
  minGen: number
  maxGen: number
  /** Set while the tribe is on the brink. */
  peril?: PerilCause
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
  const focus = useUIStore((s) => s.focus)
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
  // Faith per tribe, with a flag for blessed (+) or despairing (-).
  const faith = useWorldStore(
    useShallow((s) => {
      const f = s.world?.faith
      const out: Record<string, string> = {}
      if (!f) return out
      for (const [lid, n] of Object.entries(f.by_lineage)) out[lid] = `${n}`
      for (const lid of f.blessed) out[lid] = `${out[lid] ?? 0}+`
      for (const lid of f.despairing) out[lid] = `${out[lid] ?? 0}-`
      return out
    }),
  )

  const peril = useWorldStore(
    useShallow((s) => {
      const out: Record<string, PerilCause> = {}
      for (const p of s.world?.tribes_in_peril ?? []) out[p.lineage_id] = p.cause
      return out
    }),
  )

  const rows = useMemo((): LineageRow[] => {
    const out: LineageRow[] = []
    for (const lid in stamps) {
      const [count, minGen, maxGen] = stamps[lid].split(',').map(Number)
      out.push({
        id: lid,
        name: lineageNames?.[lid] ?? lid.slice(0, 6),
        count,
        minGen,
        maxGen,
        peril: peril[lid],
      })
    }
    return out
  }, [stamps, lineageNames, peril])
  const shown = visibleLineages(rows)

  return (
    <>
      <div className="section-title">LINEAGES ({rows.length})</div>
      <div className="lineage-list">
        {shown.map((r) => {
          const active = focus === `lineage:${r.id}`
          const brink = r.peril
            ? `On the brink: ${remainingLine(r.count)}, ${PERIL_HELP[r.peril].reason}. Click to help them.`
            : null
          return (
            <button
              key={r.id}
              type="button"
              className={'lineage-row' + (active ? ' active' : '') + (r.peril ? ' peril' : '')}
              onClick={() => setFocus(active ? 'all' : `lineage:${r.id}`)}
              aria-pressed={active}
              title={active ? 'Show all lineages' : (brink ?? `Focus ${r.name}`)}
            >
              <span className="lineage-dot" style={{ background: lineageColor(r.id) }} />
              <span className="lineage-id">{r.name}</span>
              <span className="lineage-count">
                {r.peril && (
                  <span className="lineage-peril" aria-label="on the brink">
                    ⚠
                  </span>
                )}
                {r.count}
              </span>
              <FaithMark stamp={faith[r.id]} />
              <span className="lineage-gen">
                g{r.minGen}
                {r.maxGen > r.minGen ? `-${r.maxGen}` : ''}
              </span>
            </button>
          )
        })}
        {rows.length > shown.length && (
          <button className="view-all-btn" onClick={openAllLineages}>
            view all ({rows.length})
          </button>
        )}
      </div>
    </>
  )
}

/** The gods' standing with a tribe: answered minus forsaken prayers. */
function FaithMark({ stamp }: { stamp: string | undefined }) {
  if (!stamp) return <span className="lineage-faith" />
  const n = parseInt(stamp, 10) || 0
  const blessed = stamp.endsWith('+')
  const despairing = stamp.endsWith('-')
  const tip = blessed
    ? `faith ${n} · blessed by an answered prayer`
    : despairing
      ? `faith ${n} · despairing after an unanswered prayer`
      : `faith ${n}`
  return (
    <span
      className={
        'lineage-faith' + (n < 0 ? ' low' : '') + (blessed ? ' blessed' : '') + (despairing ? ' despair' : '')
      }
      title={tip}
      aria-label={tip}
    >
      ✧{n}
    </span>
  )
}

export const LineagesList = memo(LineagesListImpl)
