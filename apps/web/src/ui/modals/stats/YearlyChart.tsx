import { useMemo } from 'react'
import { yearlySeries } from '../../../game/model/yearly'

const W = 1000
const H = 200
const PAD = { t: 12, r: 12, b: 28, l: 40 }

/** Births (above the line) and deaths (below) for each year, as paired bars. */
export function YearlyChart({ births, deaths }: { births: number[]; deaths: number[] }) {
  const years = useMemo(() => yearlySeries(births, deaths), [births, deaths])
  if (years.length === 0) {
    return (
      <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
        the first year is still turning…
      </div>
    )
  }
  const top = Math.max(1, ...years.map((y) => Math.max(y.births, y.deaths)))
  const cw = W - PAD.l - PAD.r
  const ch = H - PAD.t - PAD.b
  const mid = PAD.t + ch / 2
  const slot = cw / years.length
  const bar = Math.max(2, Math.min(18, slot * 0.36))
  const half = ch / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Births and deaths by year">
      <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} stroke="#333" />
      <text x={PAD.l - 6} y={PAD.t + 10} fill="#777" fontSize="11" textAnchor="end">
        {top}
      </text>
      <text x={PAD.l - 6} y={H - PAD.b} fill="#777" fontSize="11" textAnchor="end">
        {top}
      </text>
      {years.map((y, i) => {
        const cx = PAD.l + slot * (i + 0.5)
        const bh = (y.births / top) * half
        const dh = (y.deaths / top) * half
        return (
          <g key={y.year}>
            <rect x={cx - bar} y={mid - bh} width={bar} height={bh} fill="#8fd17a">
              <title>{`year ${y.year}: ${y.births} born`}</title>
            </rect>
            <rect x={cx} y={mid} width={bar} height={dh} fill="#b08fd1">
              <title>{`year ${y.year}: ${y.deaths} died`}</title>
            </rect>
            {(years.length <= 12 || i % Math.ceil(years.length / 12) === 0) && (
              <text x={cx} y={H - 8} fill="#777" fontSize="11" textAnchor="middle">
                {y.year}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
