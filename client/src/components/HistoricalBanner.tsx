import type { WorldMeta } from '../simulation/useHistoricalWorld'

interface Props {
  meta: WorldMeta | null
  hash: string
}

function fmtDate(ms: number): string {
  if (!ms) return 'unknown'
  const d = new Date(ms)
  return d.toISOString().slice(0, 10)
}

export function HistoricalBanner({ meta, hash }: Props) {
  const label = meta ? `${fmtDate(meta.started_at_ms)} → ${fmtDate(meta.ended_at_ms)}` : 'historical world'
  const era = meta?.top_era ?? '—'
  return (
    <div className="historical-banner" role="note">
      <span className="historical-banner__pill">FROZEN</span>
      <span className="historical-banner__text">
        Viewing past world <code>{hash}</code> · {label} · ended in {era}
      </span>
      <a className="historical-banner__back" href="/">
        ← back to live world
      </a>
    </div>
  )
}
