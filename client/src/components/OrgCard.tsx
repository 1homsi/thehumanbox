import { memo, useCallback } from 'react'
import clsx from 'clsx'
import { lineageColor, cbColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { useOrganism, useWorldStore } from '../stores/worldStore'
import { Tooltip } from './Tooltip'

function Bar({ label, value, color, tip }: { label: string; value: number; color: string; tip?: string }) {
  const labelEl = (
    <span className="bar-label" style={{ cursor: 'default' }}>
      {label}
    </span>
  )
  return (
    <div className="bar-row">
      {tip ? <Tooltip tip={tip}>{labelEl}</Tooltip> : labelEl}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value * 100}%`, background: cbColor(color) }} />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function TraitBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="trait-bar-track">
      <div className="trait-bar-fill" style={{ width: `${value * 100}%`, background: cbColor(color) }} />
    </div>
  )
}

interface OrgCardProps {
  orgId: string
}

function OrgCardImpl({ orgId }: OrgCardProps) {
  const org = useOrganism(orgId)
  const sexWords = useWorldStore((s) => s.world?.sex_words)
  const lineageNames = useWorldStore((s) => s.world?.lineage_names)
  const followOrg = useUIStore((s) => s.followOrg)
  const openConvo = useUIStore((s) => s.openConvo)
  const onTrack = useCallback(() => orgId && followOrg(orgId), [orgId, followOrg])
  const onConvos = useCallback(() => orgId && openConvo(orgId), [orgId, openConvo])

  if (!org) return null
  if (!org.lineage_id || !org.traits || !org.name) return null

  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const on = (oid: string) => useWorldStore.getState().byId.get(oid)?.name ?? (oid ?? '').slice(0, 5)
  const isSick = org.infection > 0.15
  const sexLabel = sexWords ? (org.sex === 'female' ? sexWords[1] : sexWords[0]) : undefined
  const convoCount = org.conversation_count ?? 0

  return (
    <div
      className={clsx('org-card', isSick && 'sick')}
      style={{ borderLeft: `3px solid ${lineageColor(org.lineage_id)}` }}
    >
      <div className="org-header">
        <span className="org-name">{org.name}</span>
        {isSick && (
          <Tooltip
            tip={`Infected (${(org.infection * 100).toFixed(0)}%) - illness spreads through close contact with others`}
          >
            <span className="org-sick-badge" style={{ cursor: 'default' }}>
              sick
            </span>
          </Tooltip>
        )}
        {org.pregnant && (
          <Tooltip tip="Pregnant - a child will be born in ~3 in-world days">
            <span className="org-pregnant-badge" style={{ cursor: 'default' }}>
              expecting
            </span>
          </Tooltip>
        )}
        {sexLabel && sexWords && (
          <Tooltip
            tip={
              <span>
                <span style={{ opacity: 0.6 }}>their words for the two kinds</span>
                <br />
                <span style={{ color: '#7ab0e0' }}>
                  <b>{sexWords[0]}</b>
                </span>
                {' · '}
                <span style={{ color: '#e09ab0' }}>
                  <b>{sexWords[1]}</b>
                </span>
                <br />
                <span style={{ opacity: 0.5 }}>coined by the founding generation</span>
              </span>
            }
          >
            <span
              className="org-sex-badge"
              style={{ color: org.sex === 'female' ? '#e09ab0' : '#7ab0e0', cursor: 'default' }}
            >
              {sexLabel}
            </span>
          </Tooltip>
        )}
        <Tooltip
          tip={`Generation ${org.generation} · age ${org.age} ticks (${Math.floor(org.age / 600)} days)`}
        >
          <span className="org-meta" style={{ cursor: 'default' }}>
            g{org.generation} · {org.age}
          </span>
        </Tooltip>
        <span className="org-action-btns">
          {convoCount > 0 && onConvos && (
            <button
              className="org-action-btn org-convo-btn"
              title={`${convoCount} conversation${convoCount !== 1 ? 's' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onConvos()
              }}
            >
              💬{convoCount}
            </button>
          )}
          {onTrack && (
            <button
              className="org-action-btn org-track-btn"
              title="track in world"
              onClick={(e) => {
                e.stopPropagation()
                onTrack()
              }}
            >
              ⊕
            </button>
          )}
        </span>
      </div>

      {org.attracted_to && !org.partner_id && (
        <Tooltip tip="This organism is drawn to another - they are building attraction and may bond">
          <div className="org-attraction" style={{ cursor: 'default' }}>
            drawn to someone ✦
          </div>
        </Tooltip>
      )}

      <div className="org-thought">{org.thought}</div>

      {org.attributes && org.attributes.length > 0 && (
        <div className="org-attributes">
          {org.attributes.slice(0, 8).map((attr) => (
            <span key={attr} className="org-attr-tag">
              {attr}
            </span>
          ))}
          {org.attributes.length > 8 && (
            <span className="org-attr-tag org-attr-more">+{org.attributes.length - 8}</span>
          )}
        </div>
      )}

      <Bar
        label="E"
        value={org.energy}
        color="#55dd55"
        tip="Energy - depletes over time, restored by eating food tiles. At 0% the organism starves."
      />
      <Bar
        label="H"
        value={org.hydration}
        color="#4499ff"
        tip="Hydration - depletes over time, restored by drinking water. At 0% the organism dehydrates."
      />
      <Bar
        label="♥"
        value={org.health}
        color="#ff6644"
        tip="Health - damaged by starvation, infection, and combat. Recovers slowly when needs are met."
      />
      {isSick && (
        <Bar
          label="🤒"
          value={org.infection}
          color="#bbff44"
          tip="Infection level - organism is sick and may spread illness to others nearby. Clears over time or near shelter."
        />
      )}

      <div className="trait-grid">
        <TraitBar value={org.traits.curiosity} color="#88aaff" />
        <TraitBar value={org.traits.aggression} color="#ff6655" />
        <TraitBar value={org.traits.fear} color="#ffcc44" />
        <TraitBar value={org.traits.memory_strength} color="#aa88ff" />
        <TraitBar value={org.traits.social_tendency} color="#55ddaa" />
        <TraitBar value={org.traits.resilience} color="#ff8844" />
      </div>
      <div className="trait-labels">
        <Tooltip tip="Curiosity - drives exploration and willingness to take risks">
          <span style={{ cursor: 'default' }}>cur</span>
        </Tooltip>
        <Tooltip tip="Aggression - determines combat and territorial behaviour">
          <span style={{ cursor: 'default' }}>agg</span>
        </Tooltip>
        <Tooltip tip="Fear - how cautious the organism is around danger and predators">
          <span style={{ cursor: 'default' }}>fear</span>
        </Tooltip>
        <Tooltip tip="Memory - how many locations they can remember and how well">
          <span style={{ cursor: 'default' }}>mem</span>
        </Tooltip>
        <Tooltip tip="Social - tendency to form bonds, trade, and travel with groups">
          <span style={{ cursor: 'default' }}>soc</span>
        </Tooltip>
        <Tooltip tip="Resilience - resistance to disease, temperature stress, and starvation">
          <span style={{ cursor: 'default' }}>res</span>
        </Tooltip>
      </div>

      <div className="org-memory">
        <Tooltip tip={`${org.memory_count?.food ?? 0} food locations memorized`}>
          <span style={{ cursor: 'default' }}>f{org.memory_count?.food ?? 0}</span>
        </Tooltip>
        <Tooltip tip={`${org.memory_count?.water ?? 0} water sources memorized`}>
          <span style={{ cursor: 'default' }}>w{org.memory_count?.water ?? 0}</span>
        </Tooltip>
        <Tooltip tip={`${org.memory_count?.danger ?? 0} danger zones memorized`}>
          <span style={{ cursor: 'default' }}>d{org.memory_count?.danger ?? 0}</span>
        </Tooltip>
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
                {att >= 0.25 ? '♥' : att <= -0.25 ? '✕' : '~'}
                {tn(lid)}
              </span>
            ))}
        </div>
      )}

      {org.friends && Object.keys(org.friends).length > 0 && (
        <div className="org-attitudes">
          <span style={{ fontSize: '7px', color: '#ffd070', marginRight: 2 }}>friends:</span>
          {Object.entries(org.friends)
            .slice(0, 3)
            .map(([id, name], i) => (
              <span
                key={`${id}-${name}-${i}`}
                className="attitude-tag"
                style={{ color: '#ffd070', fontSize: '7px' }}
              >
                ♦{name}
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
                {trust >= 0.3 ? '◆' : trust <= -0.3 ? '◇' : '○'}
                {on(oid)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

export const OrgCard = memo(OrgCardImpl)
