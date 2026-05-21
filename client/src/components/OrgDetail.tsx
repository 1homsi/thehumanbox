import clsx from 'clsx'
import { useState } from 'react'
import type { OrganismState } from '../types'
import { lineageColor, cbColor } from '../utils/constants'
import { Tooltip } from './Tooltip'
import { useOrgDetail } from '../hooks/useOrgDetail'
import { useUIStore } from '../stores/store'
import { LifeModal } from './LifeModal'

const DAY_LENGTH = 600

function fmt(ticks: number) {
  const days = Math.floor(ticks / DAY_LENGTH)
  return days === 1 ? '1 day' : `${days} days`
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(value, 1) * 100}%`, background: cbColor(color) }} />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function MiniBar({ label, value, color, invert, tip }: { label: string; value: number; color: string; invert?: boolean; tip?: string }) {
  const w = Math.min(value, 1) * 100
  const labelEl = <span className="trait-full-label" style={{ cursor: 'default' }}>{label}</span>
  return (
    <div className="trait-full-row">
      {tip ? <Tooltip tip={tip}>{labelEl}</Tooltip> : labelEl}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${w}%`, background: cbColor(color), opacity: invert ? 0.7 + value * 0.3 : 0.6 + value * 0.4 }} />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}</span>
    </div>
  )
}

interface Props {
  org: OrganismState
  onClose: () => void
  onFollow: (id: string | null) => void
  following: boolean
  lineageNames?: Record<string, string>
  organisms?: OrganismState[]
}

export function OrgDetail({ org, onClose, onFollow, following, lineageNames, organisms }: Props) {
  const { data: detail } = useOrgDetail(org.id)
  const [showLife, setShowLife] = useState(false)
  const starredOrgIds = useUIStore((s) => s.starredOrgIds)
  const toggleStar    = useUIStore((s) => s.toggleStar)
  const isStarred     = starredOrgIds.includes(org.id)
  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const on = (oid: string) => organisms?.find(o => o.id === oid)?.name ?? (oid ?? '').slice(0, 5)
  const ageInDays = Math.floor(org.age / DAY_LENGTH)
  const color     = lineageColor(org.lineage_id)
  const isSick   = org.infection > 0.15
  const carrying = org.carrying > 0

  const allies  = Object.entries(org.attitudes ?? {}).filter(([, v]) => v >= 0.25).sort((a, b) => b[1] - a[1])
  const enemies = Object.entries(org.attitudes ?? {}).filter(([, v]) => v <= -0.25).sort((a, b) => a[1] - b[1])

  const trustedOrgs = Object.entries(org.org_trust ?? {}).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1])
  const fearedOrgs  = Object.entries(org.org_trust ?? {}).filter(([, v]) => v <= -0.2).sort((a, b) => a[1] - b[1])

  const history = [...(detail?.thought_history ?? [])]
    .filter(e => !['observing', 'satisfied', 'exploring'].includes(e.text))
    .slice(-12)
    .reverse()

  return (
    <>
    {showLife && <LifeModal orgId={org.id} orgName={org.name} onClose={() => setShowLife(false)} />}
    <div className="org-detail" style={{ borderTop: `3px solid ${color}` }}>
      <div className="org-detail-header">
        <span className="org-detail-dot" style={{ background: color }} />
        <span className="org-detail-name">{org.name}</span>
        {isSick && <span className="org-sick-badge">sick</span>}
        {carrying && <Tooltip tip="Carrying wood"><span className="org-carrying-badge" style={{ cursor: 'default' }}>🪵</span></Tooltip>}
        <span className="org-detail-actions">
          <Tooltip tip={isStarred ? 'Unstar' : 'Star this organism (saved across reloads)'}>
            <button
              className={clsx('icon-btn', isStarred && 'active-star')}
              aria-label={isStarred ? 'Unstar' : 'Star'}
              onClick={() => toggleStar(org.id)}
            >{isStarred ? '★' : '☆'}</button>
          </Tooltip>
          <Tooltip tip="View full life history">
            <button className="icon-btn" aria-label="Life" onClick={() => setShowLife(true)}>📖</button>
          </Tooltip>
          <Tooltip tip={following ? 'Following' : 'Follow this organism'}>
            <button
              className={clsx('icon-btn', following && 'active')}
              aria-label={following ? 'Unfollow' : 'Follow'}
              onClick={() => onFollow(following ? null : org.id)}
            >⊙</button>
          </Tooltip>
          <button aria-label="Close" className="icon-btn icon-close" onClick={onClose}>✕</button>
        </span>
      </div>

      <div className="org-detail-sub">
        gen {org.generation} · {ageInDays > 0 ? `${ageInDays} day${ageInDays !== 1 ? 's' : ''} old` : 'newborn'}
        {' · '}{tn(org.lineage_id)}
        {org.max_age > 0 && ` · max ${fmt(org.max_age)}`}
      </div>

      <div className="org-detail-thought">{org.thought}</div>

      <Bar label="energy"    value={org.energy}    color="#55dd55" />
      <Bar label="hydration" value={org.hydration} color="#4499ff" />
      <Bar label="health"    value={org.health}    color="#ff6644" />
      {isSick && <Bar label="infection" value={org.infection} color="#bbff44" />}

      {(org.loneliness !== undefined || org.comfort !== undefined) && (
        <>
          <div className="org-detail-section">MENTAL STATE</div>
          <div className="trait-full-grid">
            {org.comfort     !== undefined && <MiniBar label="comfort"    value={org.comfort}    color="#88ddbb" tip="Comfort - rises near shelter and kin, falls in harsh conditions. High comfort boosts recovery." />}
            {org.loneliness  !== undefined && <MiniBar label="loneliness" value={org.loneliness} color="#aa88ff" invert tip="Loneliness - builds when isolated, eased by social contact. High loneliness drives them to seek others." />}
            {org.fear_level  !== undefined && <MiniBar label="fear"       value={org.fear_level} color="#ff8844" invert tip="Fear - spikes near predators and danger. Overrides normal behaviour; organism will flee." />}
            {org.boredom     !== undefined && <MiniBar label="boredom"    value={org.boredom}    color="#ffcc44" invert tip="Boredom - rises when idle. Pushes the organism to explore, wander, or take risks." />}
            {org.sleep_debt  !== undefined && org.sleep_debt > 0.05 && <MiniBar label="fatigue"    value={org.sleep_debt} color="#8899bb" invert tip="Fatigue - builds without rest. Organism seeks shelter to sleep; high fatigue drains health." />}
            {org.grief_ticks !== undefined && org.grief_ticks > 0 && (
              <div className="trait-full-row">
                <span className="trait-full-label">grieving</span>
                <span className="bar-pct" style={{ color: '#9988bb' }}>{org.grief_ticks} ticks</span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="org-detail-section">TRAITS</div>
      <div className="trait-full-grid">
        {([
          ['curiosity',   org.traits.curiosity,       '#88aaff', 'Curiosity - drives exploration and risk-taking. High curiosity organisms wander further and discover more.'],
          ['aggression',  org.traits.aggression,      '#ff6655', 'Aggression - determines combat initiation and territorial behaviour. High aggression = more challenges.'],
          ['fear',        org.traits.fear,            '#ffcc44', 'Fear - how quickly they flee danger. High fear means early retreat; low fear means standing ground.'],
          ['memory',      org.traits.memory_strength, '#aa88ff', 'Memory - how many locations they retain and how strongly. Better memory = smarter navigation.'],
          ['social',      org.traits.social_tendency, '#55ddaa', 'Social tendency - drives bonding, trading, and group travel. High social organisms form tribes faster.'],
          ['resilience',  org.traits.resilience,      '#ff8844', 'Resilience - resistance to disease, extreme temperatures, and starvation. Longer lifespan at high values.'],
        ] as [string, number, string, string][]).map(([label, val, col, tip]) => (
          <div key={label} className="trait-full-row">
            <Tooltip tip={tip}>
              <span className="trait-full-label" style={{ cursor: 'default' }}>{label}</span>
            </Tooltip>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${val * 100}%`, background: cbColor(col) }} />
            </div>
            <span className="bar-pct">{(val * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {(allies.length > 0 || enemies.length > 0) && (
        <>
          <div className="org-detail-section">RELATIONS</div>
          <div className="relation-list">
            {allies.map(([lid, v]) => (
              <Tooltip key={lid} tip={`Allied with ${tn(lid)} - ${(v * 100).toFixed(0)}% positive attitude. Likely to trade and cooperate.`}>
                <span className="relation-tag ally" style={{ cursor: 'default' }}>♥ {tn(lid)} {(v * 100).toFixed(0)}%</span>
              </Tooltip>
            ))}
            {enemies.map(([lid, v]) => (
              <Tooltip key={lid} tip={`Hostile toward ${tn(lid)} - ${(Math.abs(v) * 100).toFixed(0)}% negative attitude. Likely to challenge or avoid.`}>
                <span className="relation-tag enemy" style={{ cursor: 'default' }}>✕ {tn(lid)} {(v * 100).toFixed(0)}%</span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {(trustedOrgs.length > 0 || fearedOrgs.length > 0) && (
        <>
          <div className="org-detail-section">PERSONAL BONDS</div>
          <div className="relation-list">
            {trustedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip key={oid} tip={`Trusts ${on(oid)} - personal bond at ${(v * 100).toFixed(0)}%. Built through shared experiences and cooperation.`}>
                <span className="relation-tag ally" style={{ fontSize: '9px', cursor: 'default' }}>◆ {on(oid)} {(v * 100).toFixed(0)}</span>
              </Tooltip>
            ))}
            {fearedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip key={oid} tip={`Fears ${on(oid)} - negative bond at ${(Math.abs(v) * 100).toFixed(0)}%. Result of past conflict or aggression.`}>
                <span className="relation-tag enemy" style={{ fontSize: '9px', cursor: 'default' }}>◇ {on(oid)} {(v * 100).toFixed(0)}</span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      <div className="org-detail-section">MEMORY</div>
      <div className="org-memory" style={{ marginBottom: 6 }}>
        <Tooltip tip={`${org.memory_count?.food ?? 0} food tile locations remembered - organism navigates toward these when hungry`}><span style={{ cursor: 'default' }}>food ×{org.memory_count?.food ?? 0}</span></Tooltip>
        <Tooltip tip={`${org.memory_count?.water ?? 0} water source locations remembered - organism navigates toward these when thirsty`}><span style={{ cursor: 'default' }}>water ×{org.memory_count?.water ?? 0}</span></Tooltip>
        <Tooltip tip={`${org.memory_count?.danger ?? 0} danger zones remembered - organism avoids these areas when possible`}><span style={{ cursor: 'default' }}>danger ×{org.memory_count?.danger ?? 0}</span></Tooltip>
      </div>

      {history.length > 0 && (
        <>
          <div className="org-detail-section">RECENT LIFE</div>
          <div className="thought-history">
            {history.map((e, i) => (
              <div key={i} className="thought-row">
                <span className="thought-tick">t{e.tick.toLocaleString()}</span>
                <span className="thought-text">{e.text}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {detail?.vocabulary && Object.keys(detail.vocabulary).length > 0 && (
        <>
          <div className="org-detail-section">THEIR LANGUAGE</div>
          <div className="vocab-grid">
            {Object.entries(detail.vocabulary).map(([concept, word]) => (
              <div key={concept} className="vocab-row">
                <span className="vocab-word">{word}</span>
                <span className="vocab-concept">{concept}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {detail?.daily_story && (
        <>
          <div className="org-detail-section">TODAY'S STORY</div>
          <div className="daily-story">{detail.daily_story}</div>
        </>
      )}
    </div>
    </>
  )
}
