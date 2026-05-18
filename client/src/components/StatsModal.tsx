import { useMemo, useState } from 'react'
import type { WorldState, TribalRelation } from '../types'
import { lineageColor } from '../constants'
import { useFrozenSnapshot } from '../useFrozenSnapshot'
import { Modal } from './Modal'

const DAY_LENGTH = 600

function kindIcon(kind: string): string {
  switch (kind) {
    case 'rabbit': return '🐇'
    case 'deer':   return '🦌'
    case 'boar':   return '🐗'
    case 'bird':   return '🐦'
    case 'fish':   return '🐟'
    case 'wolf':   return '🐺'
    case 'dog':    return '🐕'
    default:       return '🐾'
  }
}

interface Props {
  world: WorldState
  onClose: () => void
}

function PopChart({ history }: { history: [number, number][] }) {
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

  // Y-axis labels
  const yTicks = [0, Math.floor(maxPop / 2), maxPop]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Grid lines */}
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
      {/* Area fill */}
      <path d={area} fill="rgba(100,180,80,0.14)" />
      {/* Line */}
      <path d={d} fill="none" stroke="#6abf45" strokeWidth={2.2} strokeLinejoin="round" />
      {/* X-axis labels: day numbers */}
      {points.filter((_, i) => i === 0 || i === points.length - 1 ||
        i % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, i) => (
        <text key={i} x={p.x} y={H - PAD.b + 18} textAnchor="middle"
          fill="#555" fontSize={11} fontFamily="monospace">
          d{Math.floor(p.tick / DAY_LENGTH)}
        </text>
      ))}
      {/* Current pop dot */}
      <circle cx={points[points.length-1].x} cy={points[points.length-1].y}
        r={5} fill="#6abf45" />
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

function AgePyramid({ organisms }: { organisms: WorldState['organisms'] }) {
  // Three bands: child (<900), adult (900-3600), elder (3600+ or is_elder).
  // Each split by inferred sex for a left/right pyramid.
  let cm = 0, cf = 0, am = 0, af = 0, em = 0, ef = 0
  for (const o of organisms) {
    const isMale = o.sex === 'male'
    const isElder = o.is_elder || o.age >= 3600
    if (isElder) { if (isMale) em++; else ef++; }
    else if (o.age < 900) { if (isMale) cm++; else cf++; }
    else { if (isMale) am++; else af++; }
  }
  const max = Math.max(cm + cf, am + af, em + ef, 1)
  const row = (label: string, m: number, f: number) => (
    <div className="age-row" key={label}>
      <span className="age-label">{label}</span>
      <div className="age-bar-pair">
        <div className="age-bar age-bar-m" style={{ width: `${(m / max) * 100}%` }}>{m > 0 && m}</div>
        <div className="age-bar age-bar-f" style={{ width: `${(f / max) * 100}%` }}>{f > 0 && f}</div>
      </div>
    </div>
  )
  return (
    <div className="age-pyramid">
      {row('elder', em, ef)}
      {row('adult', am, af)}
      {row('child', cm, cf)}
    </div>
  )
}

function TraitAverages({ organisms }: { organisms: WorldState['organisms'] }) {
  if (organisms.length === 0) return null
  const keys = ['curiosity', 'fear', 'social_tendency', 'resilience', 'aggression', 'memory_strength'] as const
  const sums: Record<string, number> = {}
  let n = 0
  for (const o of organisms) {
    if (!o.traits) continue
    n++
    for (const k of keys) sums[k] = (sums[k] ?? 0) + (o.traits as unknown as Record<string, number>)[k]
  }
  if (n === 0) return null
  return (
    <div className="trait-avgs">
      {keys.map(k => {
        const v = (sums[k] ?? 0) / n
        return (
          <div key={k} className="trait-row">
            <span className="trait-label">{k.replace('_', ' ')}</span>
            <div className="trait-bar-wrap">
              <div className="trait-bar" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="trait-val">{v.toFixed(2)}</span>
          </div>
        )
      })}
    </div>
  )
}

function DiscoveryRollup({ organisms }: { organisms: WorldState['organisms'] }) {
  const [showAll, setShowAll] = useState(false)
  const TOP_N = 18
  const { rows, totalDistinct } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of organisms) for (const d of (o.discoveries ?? [])) counts[d] = (counts[d] ?? 0) + 1
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return { rows: sorted, totalDistinct: sorted.length }
  }, [organisms])

  if (rows.length === 0) {
    return <div style={{ color: '#333', fontSize: 11, padding: '8px 0' }}>no discoveries yet</div>
  }
  const visible = showAll ? rows : rows.slice(0, TOP_N)
  return (
    <div className="disc-rollup">
      <div className="disc-summary">
        <span>{totalDistinct} distinct · top {Math.min(TOP_N, totalDistinct)} shown</span>
        {totalDistinct > TOP_N && (
          <button className="disc-toggle" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'collapse' : `show all (${totalDistinct})`}
          </button>
        )}
      </div>
      <div className="disc-list">
        {visible.map(([name, count]) => (
          <div key={name} className="disc-row">
            <span className="disc-name">{name}</span>
            <span className="disc-count">{count}</span>
            <span className="disc-pct">{Math.round((count / organisms.length) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BondStats({ organisms }: { organisms: WorldState['organisms'] }) {
  let partnered = 0, pregnant = 0, withKids = 0, sick = 0, hungry = 0, thirsty = 0
  for (const o of organisms) {
    if (o.partner_id) partnered++
    if (o.pregnant) pregnant++
    if ((o.children_count ?? 0) > 0) withKids++
    if (o.infection > 0.15) sick++
    if (o.energy < 0.3) hungry++
    if (o.hydration < 0.3) thirsty++
  }
  const n = organisms.length || 1
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`
  return (
    <div className="stats-death-grid">
      <span className="hist-label">partnered</span>   <span className="hist-val">{partnered} ({pct(partnered)})</span>
      <span className="hist-label">pregnant</span>    <span className="hist-val">{pregnant}</span>
      <span className="hist-label">with kids</span>   <span className="hist-val">{withKids}</span>
      <span className="hist-label">sick</span>        <span className="hist-val">{sick}</span>
      <span className="hist-label">hungry</span>      <span className="hist-val">{hungry}</span>
      <span className="hist-label">thirsty</span>     <span className="hist-val">{thirsty}</span>
    </div>
  )
}

function NotableOrgs({ organisms }: { organisms: WorldState['organisms'] }) {
  if (organisms.length === 0) return null
  const byAge   = [...organisms].sort((a, b) => b.age - a.age).slice(0, 3)
  const byKids  = [...organisms].sort((a, b) => (b.children_count ?? 0) - (a.children_count ?? 0)).slice(0, 3)
  const byGen   = [...organisms].sort((a, b) => b.generation - a.generation).slice(0, 3)
  const row = (label: string, list: WorldState['organisms'], pick: (o: WorldState['organisms'][number]) => string) => (
    <div className="notable-row" key={label}>
      <span className="notable-label">{label}</span>
      <span className="notable-list">
        {list.map(o => (
          <span key={o.id} className="notable-entry" style={{ color: lineageColor(o.lineage_id) }}>
            {o.name} <span style={{ color: '#666' }}>{pick(o)}</span>
          </span>
        ))}
      </span>
    </div>
  )
  return (
    <div className="notable-grid">
      {row('oldest',     byAge,  o => `· ${Math.floor(o.age / DAY_LENGTH)}d`)}
      {row('parents',    byKids, o => `· ${o.children_count ?? 0} kids`)}
      {row('deepest gen', byGen, o => `· g${o.generation}`)}
    </div>
  )
}

export function StatsModal({ world: liveWorld, onClose }: Props) {
  // Snapshot at open time so the panel doesn't churn on every WS tick.
  // The reload icon swaps in the current world.
  const { frozen: world, reload } = useFrozenSnapshot(() => liveWorld)
  const liveCount  = world.organisms.filter(o => o.alive).length
  const totalDeaths = (world.history.deaths_old_age ?? 0)
    + (world.history.deaths_starvation ?? 0)
    + (world.history.deaths_dehydration ?? 0)
    + (world.history.deaths_sickness ?? 0)
    + (world.history.deaths_combat ?? 0)
  const fireCount    = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('fire')).length
  const shelterCount = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('shelter')).length
  const currentDay   = Math.floor(world.tick / DAY_LENGTH)

  const animalCount  = world.animals.length
  const animalKinds  = world.animals.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind] = (acc[a.kind] ?? 0) + 1
    return acc
  }, {})

  return (
    <Modal open onClose={onClose} className="stats-modal" title="Stats" hideTitle>
        <div className="lang-modal-header">
          <span className="lang-modal-title">STATS</span>
          <span className="tree-modal-sub">day {currentDay} · {liveCount} alive</span>
          <div className="modal-header-actions">
            <button className="reload-btn" onClick={reload} title="Reload from current world">⟳</button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="stats-body">

          {/* Quick numbers */}
          <div className="stats-quick">
            <div className="stats-num-card">
              <div className="stats-num">{liveCount}</div>
              <div className="stats-num-label">alive</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{totalDeaths}</div>
              <div className="stats-num-label">total deaths</div>
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
            <div
              className="stats-num-card stats-num-card-wide"
              title={Object.entries(animalKinds).sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${kindIcon(k)} ${k}: ${n}`).join('\n')}
            >
              <div className="stats-num">{animalCount}</div>
              <div className="stats-num-label">🦌 animals</div>
              <div className="stats-num-sub">
                {Object.entries(animalKinds).sort((a, b) => b[1] - a[1]).slice(0, 3)
                  .map(([k, n]) => `${kindIcon(k)} ${n}`).join('  ')}
                {Object.keys(animalKinds).length > 3 && '  …'}
              </div>
            </div>
          </div>

          <div className="stats-section-title">POPULATION OVER TIME</div>
          <div className="stats-chart-wrap">
            <PopChart history={world.pop_history ?? []} />
          </div>

          <div className="stats-grid">
            <section>
              <div className="stats-section-title">AGE PYRAMID</div>
              <AgePyramid organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">POPULATION TRAITS</div>
              <TraitAverages organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">TRIBAL RELATIONS</div>
              <RelationsTable
                relations={world.tribal_relations ?? []}
                lineageSizes={world.lineage_sizes ?? []}
              />
            </section>

            <section>
              <div className="stats-section-title">DISCOVERY ROLLUP</div>
              <DiscoveryRollup organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
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
            </section>

            <section>
              <div className="stats-section-title">BONDS &amp; FAMILY</div>
              <BondStats organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">NOTABLE ORGANISMS</div>
              <NotableOrgs organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">DISCOVERY LOG</div>
              <DiscoveryTimeline events={world.events ?? []} />
            </section>

            {world.history.era_history && world.history.era_history.length > 0 && (
              <section>
                <div className="stats-section-title">WORLD ERAS</div>
                <div className="stats-timeline">
                  {[...world.history.era_history].reverse().slice(0, 12).map((e, i) => (
                    <div key={i} className="stats-timeline-row">
                      <span className="stats-tick">d{Math.floor(e.tick / DAY_LENGTH)}</span>
                      <span className={`era-badge era-${e.era}`} style={{ fontSize: 9 }}>{e.era}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

        </div>
    </Modal>
  )
}
