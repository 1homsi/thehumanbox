import type { OrganismState } from '../types'
import { lineageColor } from '../constants'

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value * 100}%`, background: color }} />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function TraitBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="trait-bar-track">
      <div className="trait-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  )
}

export function OrgCard({ org }: { org: OrganismState }) {
  const isSick = org.infection > 0.15

  return (
    <div
      className={`org-card ${isSick ? 'sick' : ''}`}
      style={{ borderLeft: `3px solid ${lineageColor(org.lineage_id)}` }}
    >
      <div className="org-header">
        <span className="org-name">{org.name}</span>
        {isSick && <span className="org-sick-badge">sick</span>}
        <span className="org-meta">g{org.generation} · {org.age}</span>
      </div>

      <div className="org-thought">{org.thought}</div>

      <Bar label="E" value={org.energy}    color="#55dd55" />
      <Bar label="H" value={org.hydration} color="#4499ff" />
      <Bar label="♥" value={org.health}    color="#ff6644" />
      {isSick && <Bar label="🤒" value={org.infection} color="#bbff44" />}

      <div className="trait-grid">
        <TraitBar value={org.traits.curiosity}       color="#88aaff" />
        <TraitBar value={org.traits.aggression}      color="#ff6655" />
        <TraitBar value={org.traits.fear}            color="#ffcc44" />
        <TraitBar value={org.traits.memory_strength} color="#aa88ff" />
        <TraitBar value={org.traits.social_tendency} color="#55ddaa" />
        <TraitBar value={org.traits.resilience}      color="#ff8844" />
      </div>
      <div className="trait-labels">
        <span>cur</span><span>agg</span><span>fear</span>
        <span>mem</span><span>soc</span><span>res</span>
      </div>

      <div className="org-memory">
        <span>f{org.memory_count.food}</span>
        <span>w{org.memory_count.water}</span>
        <span>d{org.memory_count.danger}</span>
      </div>

      {org.attitudes && Object.keys(org.attitudes).length > 0 && (
        <div className="org-attitudes">
          {Object.entries(org.attitudes)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 3)
            .map(([lid, att]) => (
              <span
                key={lid}
                className="attitude-tag"
                style={{ color: att >= 0.25 ? '#55ff88' : att <= -0.25 ? '#ff5544' : '#aaa' }}
              >
                {att >= 0.25 ? '♥' : att <= -0.25 ? '✕' : '~'}{lid}
              </span>
            ))}
        </div>
      )}

      {org.org_trust && Object.keys(org.org_trust).length > 0 && (
        <div className="org-attitudes">
          {Object.entries(org.org_trust)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 3)
            .map(([oid, trust]) => (
              <span
                key={oid}
                className="attitude-tag"
                style={{
                  color: trust >= 0.3 ? '#aaffdd' : trust <= -0.3 ? '#ff8866' : '#777',
                  fontSize: '7px',
                }}
              >
                {trust >= 0.3 ? '◆' : trust <= -0.3 ? '◇' : '○'}{oid.slice(0, 5)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
