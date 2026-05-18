import { useMemo } from 'react'
import { DAY_LENGTH } from './constants'

export function PopChart({ history }: { history: [number, number][] }) {
  const W = 1000
  const H = 240
  const PAD = { t: 14, r: 16, b: 36, l: 44 }

  const points = useMemo(() => {
    if (history.length < 2) return null
    const maxTick = history[history.length - 1][0]
    const minTick = history[0][0]
    const maxPop  = Math.max(...history.map(h => h[1]), 1)
    const cw = W - PAD.l - PAD.r
    const ch = H - PAD.t - PAD.b
    return history.map(([tick, pop]) => ({
      x: PAD.l + ((tick - minTick) / (maxTick - minTick || 1)) * cw,
      y: PAD.t + ch - (pop / maxPop) * ch,
      pop, tick,
    }))
  }, [history])

  if (!points || points.length < 2) {
    return <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
      accumulating data…
    </div>
  }

  const d = 'M ' + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')
  const area = d + ` L ${points[points.length-1].x},${H - PAD.b} L ${points[0].x},${H - PAD.b} Z`
  const maxPop = Math.max(...history.map(h => h[1]))

  const yTicks = [0, Math.floor(maxPop / 2), maxPop]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {yTicks.map(v => {
        const y = PAD.t + (H - PAD.t - PAD.b) - (v / maxPop) * (H - PAD.t - PAD.b)
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
              stroke="#222" strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fill="#666"
              fontSize={11} fontFamily="monospace">{v}</text>
          </g>
        )
      })}
      <path d={area} fill="rgba(100,180,80,0.14)" />
      <path d={d} fill="none" stroke="#6abf45" strokeWidth={2.2} strokeLinejoin="round" />
      {points.filter((_, i) => i === 0 || i === points.length - 1 ||
        i % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, i) => (
        <text key={i} x={p.x} y={H - PAD.b + 18} textAnchor="middle"
          fill="#555" fontSize={11} fontFamily="monospace">
          d{Math.floor(p.tick / DAY_LENGTH)}
        </text>
      ))}
      <circle cx={points[points.length-1].x} cy={points[points.length-1].y}
        r={5} fill="#6abf45" />
    </svg>
  )
}
