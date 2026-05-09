import { memo } from 'react'
import type { OrganismState, ConversationEntry } from '../types'
import { lineageColor } from '../constants'
import { useOrgDetail } from '../useOrgDetail'
import { Modal } from './Modal'

const DAY_LENGTH = 600

interface Props {
  org: OrganismState
  allOrgs: OrganismState[]
  sexWords?: [string, string]
  onClose: () => void
}

const KIND_META: Record<string, { icon: string; label: string; color: string }> = {
  courtship: { icon: '💛', label: 'First meeting',       color: '#d4a843' },
  bonded:    { icon: '♥',  label: 'Partners talking',    color: '#c07090' },
  farewell:  { icon: '✦',  label: 'Farewell',            color: '#778' },
  chat:      { icon: '💬', label: 'Casual chat',         color: '#5b9' },
  excited:   { icon: '✨', label: 'Sharing excitement',  color: '#7bbbff' },
  argue:     { icon: '⚡', label: 'Argument',            color: '#e06030' },
}

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { icon: '💬', label: kind, color: '#666' }
}

const ConvoBlock = memo(function ConvoBlock({ entry, selfOrg, allOrgs }: {
  entry: ConversationEntry
  selfOrg: OrganismState
  allOrgs: OrganismState[]
}) {
  const partner   = allOrgs.find(o => o.id === entry.with_id)
  const pColor    = partner ? lineageColor(partner.lineage_id) : '#aaa'
  const selfColor = lineageColor(selfOrg.lineage_id)
  const meta      = kindMeta(entry.kind)
  const day       = Math.floor(entry.tick / DAY_LENGTH)

  return (
    <div className="cv-block">
      {/* Header row */}
      <div className="cv-block-head">
        <span className="cv-kind-icon">{meta.icon}</span>
        <span className="cv-kind-label" style={{ color: meta.color }}>{meta.label}</span>
        <span className="cv-participants">
          <span style={{ color: selfColor, fontWeight: 600 }}>{selfOrg.name}</span>
          <span className="cv-sep">&amp;</span>
          <span style={{ color: pColor, fontWeight: 600 }}>{entry.with_name}</span>
        </span>
        <span className="cv-day">day {day}</span>
      </div>

      {/* Lines */}
      <div className="cv-lines">
        {entry.lines.map(([speaker, text], i) => {
          const isSelf = speaker !== entry.with_name
          const spColor = isSelf ? selfColor : pColor
          const meaning = entry.meanings?.[i]
          return (
            <div key={i} className={`cv-line ${isSelf ? 'cv-line-self' : 'cv-line-other'}`}>
              <div className="cv-bubble-wrap">
                <span className="cv-speaker" style={{ color: spColor }}>{speaker}</span>
                <div className="cv-bubble" style={{ borderColor: spColor + '55' }}>
                  <span className="cv-text">"{text}"</span>
                  {meaning && <span className="cv-meaning">{meaning}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export function ConversationsModal({ org, allOrgs, sexWords, onClose }: Props) {
  const detail    = useOrgDetail(org.id)
  const convos    = detail?.conversations ?? []
  const partnerOrg = org.partner_id ? allOrgs.find(o => o.id === org.partner_id) : null
  const sexLabel   = sexWords
    ? (org.sex === 'female' ? sexWords[1] : sexWords[0])
    : org.sex

  return (
    <Modal
      open
      onClose={onClose}
      className="cv-modal"
      title={`Conversations of ${org.name}`}
      hideTitle
    >
      {/* Modal header */}
      <div className="cv-modal-head">
        <span className="cv-modal-title">CONVERSATIONS</span>
        <div className="cv-modal-who">
          <span style={{ color: lineageColor(org.lineage_id), fontWeight: 700 }}>{org.name}</span>
          {sexLabel && (
            <span style={{ color: org.sex === 'female' ? '#e09ab0' : '#7ab0e0', marginLeft: 6 }}>
              {sexLabel}
            </span>
          )}
          {partnerOrg && (
            <span style={{ color: '#c07090', marginLeft: 8 }}>
              ♥ <span style={{ color: lineageColor(partnerOrg.lineage_id) }}>{partnerOrg.name}</span>
            </span>
          )}
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Body */}
      <div className="cv-modal-body">
        {convos.length === 0 ? (
          <div className="cv-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#555', textAlign: 'center' }}>
              {org.attracted_to
                ? `${org.name} is drawn to someone — a first conversation is coming`
                : `${org.name} hasn't spoken with anyone yet`}
            </div>
          </div>
        ) : (
          <div className="cv-list">
            {[...convos].reverse().map((entry, i) => (
              <ConvoBlock key={`${entry.tick}-${entry.with_id}-${i}`} entry={entry} selfOrg={org} allOrgs={allOrgs} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
