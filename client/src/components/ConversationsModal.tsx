import { memo, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { OrganismState, ConversationEntry } from '../types'
import { lineageColor } from '../utils/constants'
import { useOrgConversations } from '../hooks/useOrgConversations'
import { Modal } from './Modal'

const DAY_LENGTH = 600

interface Props {
  org: OrganismState
  allOrgs: OrganismState[]
  sexWords?: [string, string]
  onClose: () => void
}

const KIND_META: Record<string, { icon: string; label: string; color: string }> = {
  courtship: { icon: '💛', label: 'First meeting', color: '#d4a843' },
  bonded: { icon: '♥', label: 'Partners talking', color: '#c07090' },
  farewell: { icon: '✦', label: 'Farewell', color: '#778' },
  chat: { icon: '💬', label: 'Casual chat', color: '#5b9' },
  excited: { icon: '✨', label: 'Sharing excitement', color: '#7bbbff' },
  argue: { icon: '⚡', label: 'Argument', color: '#e06030' },
}

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { icon: '💬', label: kind, color: '#666' }
}

const ConvoBlock = memo(function ConvoBlock({
  entry,
  selfOrg,
  allOrgs,
}: {
  entry: ConversationEntry
  selfOrg: OrganismState
  allOrgs: OrganismState[]
}) {
  const partner = allOrgs.find((o) => o.id === entry.with_id)
  const pColor = partner ? lineageColor(partner.lineage_id) : '#aaa'
  const selfColor = lineageColor(selfOrg.lineage_id)
  const meta = kindMeta(entry.kind)
  const day = Math.floor(entry.tick / DAY_LENGTH)

  return (
    <div className="cv-block">
      {}
      <div className="cv-block-head">
        <span className="cv-kind-icon">{meta.icon}</span>
        <span className="cv-kind-label" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="cv-participants">
          <span style={{ color: selfColor, fontWeight: 600 }}>{selfOrg.name}</span>
          <span className="cv-sep">&amp;</span>
          <span style={{ color: pColor, fontWeight: 600 }}>{entry.with_name}</span>
        </span>
        <span className="cv-day">day {day}</span>
      </div>

      {}
      <div className="cv-lines">
        {entry.lines.map(([speaker, text], i) => {
          const isSelf = speaker !== entry.with_name
          const spColor = isSelf ? selfColor : pColor
          const meaning = entry.meanings?.[i]
          return (
            <div key={i} className={clsx('cv-line', isSelf ? 'cv-line-self' : 'cv-line-other')}>
              <div className="cv-bubble-wrap">
                <span className="cv-speaker" style={{ color: spColor }}>
                  {speaker}
                </span>
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

type KindFilter = 'all' | 'courtship' | 'bonded' | 'chat' | 'excited' | 'argue' | 'farewell'

export function ConversationsModal({ org, allOrgs, sexWords, onClose }: Props) {
  const { data: convosData, isLoading } = useOrgConversations(org.id)
  const allConvos = useMemo(() => convosData?.conversations ?? [], [convosData?.conversations])
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const filteredConvos = useMemo(() => {
    if (kindFilter === 'all') return allConvos
    return allConvos.filter((c) => c.kind === kindFilter)
  }, [allConvos, kindFilter])
  const partnerOrg = org.partner_id ? allOrgs.find((o) => o.id === org.partner_id) : null
  const sexLabel = sexWords ? (org.sex === 'female' ? sexWords[1] : sexWords[0]) : org.sex
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of allConvos) counts[c.kind] = (counts[c.kind] ?? 0) + 1
    return counts
  }, [allConvos])

  return (
    <Modal open onClose={onClose} className="cv-modal" title={`Conversations of ${org.name}`} hideTitle>
      {}
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
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {allConvos.length > 1 && (
        <div
          className="cv-filters"
          style={{ display: 'flex', gap: 6, padding: '6px 12px', flexWrap: 'wrap' }}
        >
          {(['all', 'courtship', 'bonded', 'chat', 'excited', 'argue', 'farewell'] as KindFilter[]).map(
            (k) => {
              const count = k === 'all' ? allConvos.length : (kindCounts[k] ?? 0)
              if (k !== 'all' && count === 0) return null
              const isActive = kindFilter === k
              const meta = k === 'all' ? { icon: '∗', label: 'all', color: '#999' } : kindMeta(k)
              return (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  style={{
                    background: isActive ? meta.color + '22' : 'transparent',
                    border: `1px solid ${isActive ? meta.color : '#2a2520'}`,
                    color: isActive ? meta.color : '#888',
                    padding: '3px 8px',
                    borderRadius: 3,
                    fontSize: 10,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {meta.icon} {meta.label} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}
                </button>
              )
            },
          )}
        </div>
      )}

      {}
      <div className="cv-modal-body">
        {isLoading && !convosData ? (
          <div className="cv-empty">
            <div className="cv-loading-dot" aria-hidden>
              •••
            </div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#555', textAlign: 'center' }}>
              loading {org.name}'s conversations…
            </div>
          </div>
        ) : filteredConvos.length === 0 ? (
          <div className="cv-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#555', textAlign: 'center' }}>
              {allConvos.length === 0
                ? org.attracted_to
                  ? `${org.name} is drawn to someone - a first conversation is coming`
                  : `${org.name} hasn't spoken with anyone yet`
                : `no ${kindFilter} conversations`}
            </div>
          </div>
        ) : (
          <div className="cv-list">
            {[...filteredConvos].reverse().map((entry, i) => (
              <ConvoBlock
                key={`${entry.tick}-${entry.with_id}-${i}`}
                entry={entry}
                selfOrg={org}
                allOrgs={allOrgs}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
