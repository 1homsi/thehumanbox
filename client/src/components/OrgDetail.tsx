import type { OrganismState } from '../types'
import { lineageColor } from '../constants'

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
        <div className="bar-fill" style={{ width: `${Math.min(value, 1) * 100}%`, background: color }} />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function MiniBar({ label, value, color, invert }: { label: string; value: number; color: string; invert?: boolean }) {
  const display = invert ? value : value
  const w = Math.min(display, 1) * 100
  return (
    <div className="trait-full-row">
      <span className="trait-full-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${w}%`, background: color, opacity: invert ? 0.7 + value * 0.3 : 0.6 + value * 0.4 }} />
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
}

export function OrgDetail({ org, onClose, onFollow, following }: Props) {
  const ageInDays = Math.floor(org.age / DAY_LENGTH)
  const color     = lineageColor(org.lineage_id)
  const isSick   = org.infection > 0.15
  const carrying = org.carrying > 0

  const allies  = Object.entries(org.attitudes).filter(([, v]) => v >= 0.25).sort((a, b) => b[1] - a[1])
  const enemies = Object.entries(org.attitudes).filter(([, v]) => v <= -0.25).sort((a, b) => a[1] - b[1])

  const trustedOrgs = Object.entries(org.org_trust).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1])
  const fearedOrgs  = Object.entries(org.org_trust).filter(([, v]) => v <= -0.2).sort((a, b) => a[1] - b[1])

  // Significant thought events (deduplicated)
  const history = [...org.thought_history]
    .filter(e => !['observing', 'satisfied', 'exploring'].includes(e.text))
    .slice(-12)
    .reverse()

  return (
    <div className="org-detail" style={{ borderTop: `3px solid ${color}` }}>
      <div className="org-detail-header">
        <span className="org-detail-dot" style={{ background: color }} />
        <span className="org-detail-name">{org.name}</span>
        {isSick && <span className="org-sick-badge">sick</span>}
        {carrying && <span className="org-carrying-badge">🪵 wood</span>}
        <button
          className={`follow-btn${following ? ' active' : ''}`}
          onClick={() => onFollow(following ? null : org.id)}
          title="Follow this organism"
        >{following ? '⊙ following' : '⊙ follow'}</button>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="org-detail-sub">
        gen {org.generation} · {ageInDays > 0 ? `${ageInDays} day${ageInDays !== 1 ? 's' : ''} old` : 'newborn'}
        {' · '}{org.lineage_id.slice(0, 6)}
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
            {org.comfort     !== undefined && <MiniBar label="comfort"    value={org.comfort}    color="#88ddbb" />}
            {org.loneliness  !== undefined && <MiniBar label="loneliness" value={org.loneliness} color="#aa88ff" invert />}
            {org.fear_level  !== undefined && <MiniBar label="fear"       value={org.fear_level} color="#ff8844" invert />}
            {org.boredom     !== undefined && <MiniBar label="boredom"    value={org.boredom}    color="#ffcc44" invert />}
            {org.sleep_debt  !== undefined && org.sleep_debt > 0.05 && <MiniBar label="fatigue"    value={org.sleep_debt} color="#8899bb" invert />}
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
        {[
          ['curiosity',    org.traits.curiosity,       '#88aaff'],
          ['aggression',   org.traits.aggression,      '#ff6655'],
          ['fear',         org.traits.fear,            '#ffcc44'],
          ['memory',       org.traits.memory_strength, '#aa88ff'],
          ['social',       org.traits.social_tendency, '#55ddaa'],
          ['resilience',   org.traits.resilience,      '#ff8844'],
        ].map(([label, val, col]) => (
          <div key={label as string} className="trait-full-row">
            <span className="trait-full-label">{label as string}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(val as number) * 100}%`, background: col as string }} />
            </div>
            <span className="bar-pct">{((val as number) * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {(allies.length > 0 || enemies.length > 0) && (
        <>
          <div className="org-detail-section">RELATIONS</div>
          <div className="relation-list">
            {allies.map(([lid, v]) => (
              <span key={lid} className="relation-tag ally">♥ {lid.slice(0, 6)} {(v * 100).toFixed(0)}%</span>
            ))}
            {enemies.map(([lid, v]) => (
              <span key={lid} className="relation-tag enemy">✕ {lid.slice(0, 6)} {(v * 100).toFixed(0)}%</span>
            ))}
          </div>
        </>
      )}

      {(trustedOrgs.length > 0 || fearedOrgs.length > 0) && (
        <>
          <div className="org-detail-section">PERSONAL BONDS</div>
          <div className="relation-list">
            {trustedOrgs.slice(0, 4).map(([oid, v]) => (
              <span key={oid} className="relation-tag ally" style={{ fontSize: '9px' }}>◆ {oid.slice(0, 5)} {(v * 100).toFixed(0)}</span>
            ))}
            {fearedOrgs.slice(0, 4).map(([oid, v]) => (
              <span key={oid} className="relation-tag enemy" style={{ fontSize: '9px' }}>◇ {oid.slice(0, 5)} {(v * 100).toFixed(0)}</span>
            ))}
          </div>
        </>
      )}

      <div className="org-detail-section">MEMORY</div>
      <div className="org-memory" style={{ marginBottom: 6 }}>
        <span>food ×{org.memory_count.food}</span>
        <span>water ×{org.memory_count.water}</span>
        <span>danger ×{org.memory_count.danger}</span>
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

      {org.vocabulary && Object.keys(org.vocabulary).length > 0 && (
        <>
          <div className="org-detail-section">THEIR LANGUAGE</div>
          <div className="vocab-grid">
            {Object.entries(org.vocabulary).map(([concept, word]) => (
              <div key={concept} className="vocab-row">
                <span className="vocab-word">{word}</span>
                <span className="vocab-concept">{concept}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {org.daily_story && (
        <>
          <div className="org-detail-section">TODAY'S STORY</div>
          <div className="daily-story">{org.daily_story}</div>
        </>
      )}
    </div>
  )
}
