import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { Tooltip } from './Tooltip'

function Bar({ label, value, color, tip }: { label: string; value: number; color: string; tip?: string }) {
  const labelEl = <span className="bar-label" style={{ cursor: 'default' }}>{label}</span>
  return (
    <div className="bar-row">
      {tip ? <Tooltip tip={tip}>{labelEl}</Tooltip> : labelEl}
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

interface OrgCardProps {
  org: OrganismState
  sexWords?: [string, string]
  onTrack?:  () => void
  onConvos?: () => void
  lineageNames?: Record<string, string>
  organisms?: OrganismState[]
}

export function OrgCard({ org, sexWords, onTrack, onConvos, lineageNames, organisms }: OrgCardProps) {
  const tn     = (lid: string) => lineageNames?.[lid] ?? lid.slice(0, 6)
  const on     = (oid: string) => organisms?.find(o => o.id === oid)?.name ?? oid.slice(0, 5)
  const isSick = org.infection > 0.15
  const sexLabel  = sexWords
    ? (org.sex === 'female' ? sexWords[1] : sexWords[0])
    : undefined
  const convoCount = org.conversation_count ?? 0

  return (
    <div
      className={`org-card ${isSick ? 'sick' : ''}`}
      style={{ borderLeft: `3px solid ${lineageColor(org.lineage_id)}` }}
    >
      <div className="org-header">
        <span className="org-name">{org.name}</span>
        {isSick && <Tooltip tip={`Infected (${(org.infection * 100).toFixed(0)}%) — illness spreads through close contact with others`}><span className="org-sick-badge" style={{ cursor: 'default' }}>sick</span></Tooltip>}
        {org.pregnant && <Tooltip tip="Pregnant — a child will be born in ~3 in-world days"><span className="org-pregnant-badge" style={{ cursor: 'default' }}>expecting</span></Tooltip>}
        {sexLabel && sexWords && (
          <Tooltip tip={
            <span>
              <span style={{ opacity: 0.6 }}>their words for the two kinds</span>
              <br />
              <span style={{ color: '#7ab0e0' }}><b>{sexWords[0]}</b></span>
              {' · '}
              <span style={{ color: '#e09ab0' }}><b>{sexWords[1]}</b></span>
              <br />
              <span style={{ opacity: 0.5 }}>coined by the founding generation</span>
            </span>
          }>
            <span
              className="org-sex-badge"
              style={{ color: org.sex === 'female' ? '#e09ab0' : '#7ab0e0', cursor: 'default' }}
            >
              {sexLabel}
            </span>
          </Tooltip>
        )}
        <Tooltip tip={`Generation ${org.generation} · age ${org.age} ticks (${Math.floor(org.age / 600)} days)`}><span className="org-meta" style={{ cursor: 'default' }}>g{org.generation} · {org.age}</span></Tooltip>
        <span className="org-action-btns">
          {convoCount > 0 && onConvos && (
            <button
              className="org-action-btn org-convo-btn"
              title={`${convoCount} conversation${convoCount !== 1 ? 's' : ''}`}
              onClick={e => { e.stopPropagation(); onConvos() }}
            >
              💬{convoCount}
            </button>
          )}
          {onTrack && (
            <button
              className="org-action-btn org-track-btn"
              title="track in world"
              onClick={e => { e.stopPropagation(); onTrack() }}
            >
              ⊕
            </button>
          )}
        </span>
      </div>

      {org.attracted_to && !org.partner_id && (
        <Tooltip tip="This organism is drawn to another — they are building attraction and may bond">
          <div className="org-attraction" style={{ cursor: 'default' }}>drawn to someone ✦</div>
        </Tooltip>
      )}

      <div className="org-thought">{org.thought}</div>

      <Bar label="E" value={org.energy}    color="#55dd55" tip="Energy — depletes over time, restored by eating food tiles. At 0% the organism starves." />
      <Bar label="H" value={org.hydration} color="#4499ff" tip="Hydration — depletes over time, restored by drinking water. At 0% the organism dehydrates." />
      <Bar label="♥" value={org.health}    color="#ff6644" tip="Health — damaged by starvation, infection, and combat. Recovers slowly when needs are met." />
      {isSick && <Bar label="🤒" value={org.infection} color="#bbff44" tip="Infection level — organism is sick and may spread illness to others nearby. Clears over time or near shelter." />}

      <div className="trait-grid">
        <TraitBar value={org.traits.curiosity}       color="#88aaff" />
        <TraitBar value={org.traits.aggression}      color="#ff6655" />
        <TraitBar value={org.traits.fear}            color="#ffcc44" />
        <TraitBar value={org.traits.memory_strength} color="#aa88ff" />
        <TraitBar value={org.traits.social_tendency} color="#55ddaa" />
        <TraitBar value={org.traits.resilience}      color="#ff8844" />
      </div>
      <div className="trait-labels">
        <Tooltip tip="Curiosity — drives exploration and willingness to take risks"><span style={{ cursor: 'default' }}>cur</span></Tooltip>
        <Tooltip tip="Aggression — determines combat and territorial behaviour"><span style={{ cursor: 'default' }}>agg</span></Tooltip>
        <Tooltip tip="Fear — how cautious the organism is around danger and predators"><span style={{ cursor: 'default' }}>fear</span></Tooltip>
        <Tooltip tip="Memory — how many locations they can remember and how well"><span style={{ cursor: 'default' }}>mem</span></Tooltip>
        <Tooltip tip="Social — tendency to form bonds, trade, and travel with groups"><span style={{ cursor: 'default' }}>soc</span></Tooltip>
        <Tooltip tip="Resilience — resistance to disease, temperature stress, and starvation"><span style={{ cursor: 'default' }}>res</span></Tooltip>
      </div>

      <div className="org-memory">
        <Tooltip tip={`${org.memory_count.food} food locations memorized`}><span style={{ cursor: 'default' }}>f{org.memory_count.food}</span></Tooltip>
        <Tooltip tip={`${org.memory_count.water} water sources memorized`}><span style={{ cursor: 'default' }}>w{org.memory_count.water}</span></Tooltip>
        <Tooltip tip={`${org.memory_count.danger} danger zones memorized`}><span style={{ cursor: 'default' }}>d{org.memory_count.danger}</span></Tooltip>
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
                {att >= 0.25 ? '♥' : att <= -0.25 ? '✕' : '~'}{tn(lid)}
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
                {trust >= 0.3 ? '◆' : trust <= -0.3 ? '◇' : '○'}{on(oid)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
