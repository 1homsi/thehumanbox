import { personName } from '../../shared/personName'
import { memo, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { OrganismState, ConversationEntry } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useOrgConversations } from '../../shared/hooks/useOrgConversations'
import { WithQueryClient } from '../../shared/query'
import { Modal, ModalHeader } from './Modal'
import { eventDate } from '../event-date'
import { t, type MessageKey } from '../../i18n'
import { PixelIcon, type SpriteName } from '../toolbar/ToolSprite'

interface Props {
  org: OrganismState
  allOrgs: OrganismState[]
  sexWords?: [string, string]
  onClose: () => void
}

const KIND_META: Record<string, { icon: SpriteName; label: MessageKey; color: string }> = {
  courtship: { icon: 'ring', label: 'dialogs.conversations.kinds.courtship', color: '#d4a843' },
  bonded: { icon: 'heart', label: 'dialogs.conversations.kinds.bonded', color: '#c07090' },
  farewell: { icon: 'dove', label: 'dialogs.conversations.kinds.farewell', color: '#778' },
  chat: { icon: 'v_bubble', label: 'dialogs.conversations.kinds.chat', color: '#5b9' },
  gossip: { icon: 'v_eye', label: 'dialogs.conversations.kinds.gossip', color: '#b98ad0' },
  excited: { icon: 'sparkle', label: 'dialogs.conversations.kinds.excited', color: '#7bbbff' },
  argue: { icon: 'bolt', label: 'dialogs.conversations.kinds.argue', color: '#e06030' },
}

function kindMeta(kind: string): { icon: SpriteName; label: string; color: string } {
  const meta = KIND_META[kind]
  return meta
    ? { icon: meta.icon, label: t(meta.label), color: meta.color }
    : { icon: 'v_bubble', label: kind, color: '#666' }
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
  // The header names people as they are now; the transcript below keeps the names as they were spoken.
  const partnerName = partner ? personName(partner) : entry.with_name
  const selfColor = lineageColor(selfOrg.lineage_id)
  const meta = kindMeta(entry.kind)
  const trust = selfOrg.org_trust?.[entry.with_id] ?? 0
  const rel =
    selfOrg.partner_id === entry.with_id
      ? { text: t('dialogs.conversations.relPartner'), color: '#c07090' }
      : selfOrg.friends?.[entry.with_id]
        ? { text: t('dialogs.conversations.relFriend'), color: '#5b9' }
        : trust > 0.25
          ? { text: t('dialogs.conversations.relTrusts'), color: '#7bbbff' }
          : trust < -0.25
            ? { text: t('dialogs.conversations.relWary'), color: '#e06030' }
            : null

  return (
    <div className="cv-block">
      {}
      <div className="cv-block-head">
        <span className="cv-kind-icon">
          <PixelIcon name={meta.icon} size={12} />
        </span>
        <span className="cv-kind-label" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="cv-participants">
          <span style={{ color: selfColor, fontWeight: 600 }}>{personName(selfOrg)}</span>
          <span className="cv-sep">&amp;</span>
          <span style={{ color: pColor, fontWeight: 600 }}>{partnerName}</span>
        </span>
        {rel && (
          <span
            style={{
              color: rel.color,
              fontSize: 10,
              border: `1px solid ${rel.color}55`,
              borderRadius: 3,
              padding: '1px 5px',
              marginLeft: 6,
            }}
          >
            {rel.text}
          </span>
        )}
        <span className="cv-day">{eventDate(entry.tick)}</span>
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

type KindFilter = 'all' | 'courtship' | 'bonded' | 'chat' | 'gossip' | 'excited' | 'argue' | 'farewell'

function ConversationsModalBody({ org, allOrgs, sexWords, onClose }: Props) {
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
    <Modal
      open
      onClose={onClose}
      className="cv-modal"
      title={t('dialogs.conversations.title', { name: personName(org) })}
      hideTitle
    >
      <ModalHeader
        title={t('dialogs.conversations.heading')}
        onClose={onClose}
        closeLabel={t('dialogs.conversations.close')}
      >
        <div className="cv-modal-who">
          <span style={{ color: lineageColor(org.lineage_id), fontWeight: 700 }}>{personName(org)}</span>
          {sexLabel && (
            <span style={{ color: org.sex === 'female' ? '#e09ab0' : '#7ab0e0', marginLeft: 6 }}>
              {sexLabel}
            </span>
          )}
          {partnerOrg && (
            <span style={{ color: '#c07090', marginLeft: 8 }}>
              ♥ <span style={{ color: lineageColor(partnerOrg.lineage_id) }}>{personName(partnerOrg)}</span>
            </span>
          )}
        </div>
      </ModalHeader>

      {allConvos.length > 1 && (
        <div className="cv-filters">
          {(
            ['all', 'courtship', 'bonded', 'chat', 'gossip', 'excited', 'argue', 'farewell'] as KindFilter[]
          ).map((k) => {
            const count = k === 'all' ? allConvos.length : (kindCounts[k] ?? 0)
            if (k !== 'all' && count === 0) return null
            const isActive = kindFilter === k
            const meta = k === 'all' ? null : kindMeta(k)
            return (
              <button
                key={k}
                type="button"
                className={clsx('filter-chip cv-filter', isActive && 'active')}
                aria-pressed={isActive}
                onClick={() => setKindFilter(k)}
              >
                {meta && <PixelIcon name={meta.icon} size={11} />}
                {meta ? meta.label : t('dialogs.conversations.filterAll')}
                {count > 0 && <span className="cv-filter-count">({count})</span>}
              </button>
            )
          })}
        </div>
      )}

      {}
      <div className="cv-modal-body">
        {isLoading && !convosData ? (
          <div className="cv-empty">
            <div className="cv-loading-dot" aria-hidden>
              •••
            </div>
            <div className="cv-empty-text">
              {t('dialogs.conversations.loading', { name: personName(org) })}
            </div>
          </div>
        ) : filteredConvos.length === 0 ? (
          <div className="cv-empty">
            <div className="cv-empty-icon">
              <PixelIcon name="v_bubble" size={28} />
            </div>
            <div className="cv-empty-text">
              {allConvos.length === 0
                ? org.attracted_to
                  ? t('dialogs.conversations.drawn', { name: personName(org) })
                  : t('dialogs.conversations.noneYet', { name: personName(org) })
                : t('dialogs.conversations.noneOfKind', { kind: kindMeta(kindFilter).label })}
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

export function ConversationsModal(props: Props) {
  return (
    <WithQueryClient>
      <ConversationsModalBody {...props} />
    </WithQueryClient>
  )
}
