import { useMemo } from 'react'
import type { WorldState, TribalRelation } from '../types'
import { lineageColor } from '../constants'

const DAY_LENGTH = 600

interface Props {
  world: WorldState
  onClose: () => void
}

function PopChart({ history }: { history: [number, number][] }) {
  const W = 520
  const H = 120
  const PAD = { t: 10, r: 12, b: 28, l: 32 }

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

  // Y-axis labels
  const yTicks = [0, Math.floor(maxPop / 2), maxPop]

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {yTicks.map(v => {
        const y = PAD.t + (H - PAD.t - PAD.b) - (v / maxPop) * (H - PAD.t - PAD.b)
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
              stroke="#222" strokeWidth={0.5} />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" fill="#444"
              fontSize={8} fontFamily="monospace">{v}</text>
          </g>
        )
      })}
      {/* Area fill */}
      <path d={area} fill="rgba(100,180,80,0.12)" />
      {/* Line */}
      <path d={d} fill="none" stroke="#6abf45" strokeWidth={1.5} strokeLinejoin="round" />
      {/* X-axis labels: day numbers */}
      {points.filter((_, i) => i === 0 || i === points.length - 1 ||
        i % Math.max(1, Math.floor(points.length / 4)) === 0).map((p, i) => (
        <text key={i} x={p.x} y={H - PAD.b + 10} textAnchor="middle"
          fill="#333" fontSize={7} fontFamily="monospace">
          d{Math.floor(p.tick / DAY_LENGTH)}
        </text>
      ))}
      {/* Current pop dot */}
      <circle cx={points[points.length-1].x} cy={points[points.length-1].y}
        r={3} fill="#6abf45" />
    </svg>
  )
}

function RelationsTable({ relations, lineageSizes }: {
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

function DiscoveryTimeline({ events }: { events: WorldState['events'] }) {
  const milestones = events
    .filter(e => e.type === 'build' && (
      e.detail.includes('mastered') ||
      e.detail.includes('discovered') ||
      e.detail.includes('planted a farm')
    ))
    .slice(-20)

  if (milestones.length === 0) {
    return <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>
      no discoveries yet
    </div>
  }

  return (
    <div className="stats-timeline">
      {milestones.map((e, i) => (
        <div key={i} className="stats-timeline-row">
          <span className="stats-tick">d{Math.floor(e.tick / DAY_LENGTH)}</span>
          <span className="stats-actor">{e.actor}</span>
          <span className="stats-detail">{e.detail}</span>
        </div>
      ))}
    </div>
  )
}

export function StatsModal({ world, onClose }: Props) {
  const liveCount  = world.organisms.filter(o => o.alive).length
  const deadCount  = world.organisms.filter(o => !o.alive).length
  const fireCount    = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('fire')).length
  const shelterCount = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('shelter')).length
  const currentDay   = Math.floor(world.tick / DAY_LENGTH)

  return (
    <div className="lang-modal-backdrop" onClick={onClose}>
      <div className="stats-modal" onClick={e => e.stopPropagation()}>

        <div className="lang-modal-header">
          <span className="lang-modal-title">STATS</span>
          <span className="tree-modal-sub">day {currentDay} · {liveCount} alive</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="stats-body">

          {/* Quick numbers */}
          <div className="stats-quick">
            <div className="stats-num-card">
              <div className="stats-num">{liveCount}</div>
              <div className="stats-num-label">alive</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{deadCount}</div>
              <div className="stats-num-label">ancestors</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{world.history.births}</div>
              <div className="stats-num-label">total births</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{currentDay}</div>
              <div className="stats-num-label">days elapsed</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{fireCount}</div>
              <div className="stats-num-label">🔥 know fire</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{shelterCount}</div>
              <div className="stats-num-label">🏠 have shelter</div>
            </div>
          </div>

          {/* Population chart */}
          <div className="stats-section-title">POPULATION OVER TIME</div>
          <div className="stats-chart-wrap">
            <PopChart history={world.pop_history ?? []} />
          </div>

          {/* Tribal relations */}
          <div className="stats-section-title">TRIBAL RELATIONS</div>
          <RelationsTable
            relations={world.tribal_relations ?? []}
            lineageSizes={world.lineage_sizes ?? []}
          />

          {/* Discovery timeline */}
          <div className="stats-section-title">DISCOVERY LOG</div>
          <DiscoveryTimeline events={world.events ?? []} />

          {/* World era history */}
          {world.history.era_history && world.history.era_history.length > 0 && (
            <>
              <div className="stats-section-title">WORLD ERAS</div>
              <div className="stats-timeline">
                {[...world.history.era_history].reverse().slice(0, 12).map((e, i) => (
                  <div key={i} className="stats-timeline-row">
                    <span className="stats-tick">d{Math.floor(e.tick / DAY_LENGTH)}</span>
                    <span className={`era-badge era-${e.era}`} style={{ fontSize: 9 }}>{e.era}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Deaths breakdown */}
          <div className="stats-section-title">CAUSES OF DEATH</div>
          <div className="stats-death-grid">
            <span className="hist-label">starvation</span>  <span className="hist-val">{world.history.deaths_starvation}</span>
            <span className="hist-label">dehydration</span> <span className="hist-val">{world.history.deaths_dehydration}</span>
            <span className="hist-label">sickness</span>    <span className="hist-val">{world.history.deaths_sickness}</span>
            <span className="hist-label">combat</span>      <span className="hist-val">{world.history.deaths_combat}</span>
            <span className="hist-label">old age</span>     <span className="hist-val">{world.history.deaths_old_age}</span>
            <span className="hist-label">droughts</span>    <span className="hist-val">{world.history.droughts}</span>
            <span className="hist-label">outbreaks</span>   <span className="hist-val">{world.history.outbreaks}</span>
          </div>

        </div>
      </div>
    </div>
  )
}
