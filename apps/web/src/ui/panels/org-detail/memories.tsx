import { lineageColor } from '../../../shared/constants'
import type { OrganismState, OrgDetail } from '../../../shared/types'

export function BondsRememberedSection({
  detail,
  organisms,
  onSelectOrg,
}: {
  detail: OrgDetail | null
  organisms?: OrganismState[]
  onSelectOrg?: (id: string) => void
}) {
  return (
    <>
      {detail?.memories && detail.memories.filter((m) => m.kind === 'bond').length > 0 && (
        <>
          <div className="org-detail-section">BONDS REMEMBERED</div>
          <div className="thought-history">
            {detail.memories
              .filter((m) => m.kind === 'bond')
              .slice(0, 8)
              .map((m, i) => {
                const relatedOrg = m.related_id ? organisms?.find((o) => o.id === m.related_id) : null
                const emo = m.emotion >= 1 ? '#f6c46a' : m.emotion <= -1 ? '#6090c0' : '#d0c8c0'
                return (
                  <div key={`bond-${i}`} className="thought-row" style={{ alignItems: 'flex-start' }}>
                    <span
                      className="thought-tick"
                      style={{ color: '#e09ab0', fontWeight: 600, minWidth: 50 }}
                    >
                      bond
                    </span>
                    <span className="thought-text" style={{ color: emo, flex: 1 }}>
                      {m.text}
                      {relatedOrg && (
                        <button
                          onClick={() => onSelectOrg?.(relatedOrg.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #2a2520',
                            color: lineageColor(relatedOrg.lineage_id),
                            fontSize: 9,
                            padding: '1px 5px',
                            marginLeft: 6,
                            borderRadius: 3,
                            cursor: 'pointer',
                          }}
                        >
                          ↪ {relatedOrg.name}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </>
  )
}

export function MemoriesSection({
  detail,
  organisms,
  onSelectOrg,
}: {
  detail: OrgDetail | null
  organisms?: OrganismState[]
  onSelectOrg?: (id: string) => void
}) {
  return (
    <>
      {detail?.memories && detail.memories.length > 0 && (
        <>
          <div className="org-detail-section">WHAT THEY REMEMBER</div>
          <div className="thought-history">
            {detail.memories.map((m, i) => {
              const kindColor: Record<string, string> = {
                core: '#d8c060',
                episode: '#bfa9d6',
                fact: '#90c8b0',
                bond: '#e09ab0',
                place: '#a8c0e0',
                dream: '#888',
              }
              const emoColor =
                m.emotion >= 2
                  ? '#f6c46a'
                  : m.emotion >= 1
                    ? '#d8c060'
                    : m.emotion <= -2
                      ? '#6090c0'
                      : m.emotion <= -1
                        ? '#80a8c0'
                        : '#d0c8c0'
              const bars = Math.max(1, Math.round(m.salience * 5))
              const relatedOrg = m.related_id ? organisms?.find((o) => o.id === m.related_id) : null
              return (
                <div key={i} className="thought-row" style={{ alignItems: 'flex-start' }}>
                  <span
                    className="thought-tick"
                    style={{
                      color: kindColor[m.kind] ?? '#999',
                      fontWeight: 600,
                      minWidth: 56,
                    }}
                    title={`${m.kind} — salience ${(m.salience * 100).toFixed(0)}%${m.recalls > 0 ? ` · recalled ${m.recalls}x` : ''}`}
                  >
                    {m.kind}
                  </span>
                  <span className="thought-text" style={{ color: emoColor, flex: 1 }}>
                    {m.text}
                    {relatedOrg && (
                      <button
                        onClick={() => onSelectOrg?.(relatedOrg.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #2a2520',
                          color: '#9ad0f0',
                          fontSize: 9,
                          padding: '1px 5px',
                          marginLeft: 6,
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                        title={`Go to ${relatedOrg.name}`}
                      >
                        ↪ {relatedOrg.name}
                      </button>
                    )}
                  </span>
                  <span
                    style={{ color: '#444', fontFamily: 'monospace', fontSize: 9, marginLeft: 6 }}
                    title={`salience ${(m.salience * 100).toFixed(0)}%`}
                  >
                    {'▮'.repeat(bars)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
