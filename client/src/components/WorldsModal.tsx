import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { fetchWorldsList, type WorldMeta } from '../simulation/useHistoricalWorld'

interface Props {
  onClose: () => void
}

function fmtDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}

function fmtRange(start: number, end: number): string {
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)))
  return `${days} day${days === 1 ? '' : 's'}`
}

export function WorldsModal({ onClose }: Props) {
  const [worlds, setWorlds] = useState<WorldMeta[] | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetchWorldsList(ctl.signal)
      .then(setWorlds)
      .catch(e => {
        if (ctl.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ctl.abort()
  }, [])

  return (
    <Modal open onClose={onClose} className="worlds-modal" title="Past worlds" hideTitle>
      <div className="worlds-head">
        <span className="worlds-title">PAST WORLDS</span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="worlds-body">
        <p className="worlds-blurb">
          The live world resets at the start of every month. Old worlds are frozen here
          forever - explore the end-state of each civilisation.
        </p>
        {error && <div className="worlds-err">could not load: {error}</div>}
        {!error && worlds == null && <div className="worlds-loading">loading…</div>}
        {!error && worlds && worlds.length === 0 && (
          <div className="worlds-empty">no past worlds yet. check back at the next month rollover.</div>
        )}
        {!error && worlds && worlds.length > 0 && (
          <ul className="worlds-list">
            {worlds.map(w => (
              <li key={w.hash} className="worlds-row">
                <a className="worlds-row-link" href={`/world/${w.hash}`}>
                  <span className="worlds-row-era">{w.top_era}</span>
                  <span className="worlds-row-hash">{w.hash}</span>
                  <span className="worlds-row-range">
                    {fmtDate(w.started_at_ms)} → {fmtDate(w.ended_at_ms)}
                    <span className="worlds-row-dur"> · {fmtRange(w.started_at_ms, w.ended_at_ms)}</span>
                  </span>
                  <span className="worlds-row-stats">
                    pop {w.final_population} (peak {w.peak_population}) · {w.lineage_count} lineage{w.lineage_count === 1 ? '' : 's'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
