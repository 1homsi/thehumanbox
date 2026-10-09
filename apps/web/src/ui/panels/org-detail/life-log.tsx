import { deathLine } from '../../../game/model/death'
import { lifeStory } from '../../../game/model/life-story'
import { familySentence } from '../../../game/model/family-lines'
import { Tooltip } from '../../toolbar/Tooltip'
import type { OrganismState, OrgDetail } from '../../../shared/types'

export function MemoryCountsSection({ org }: { org: OrganismState }) {
  return (
    <>
      <div className="org-detail-section">MEMORY</div>
      <div className="org-memory" style={{ marginBottom: 6 }}>
        <Tooltip
          tip={`${org.memory_count?.food ?? 0} food tile locations remembered - organism navigates toward these when hungry`}
        >
          <span style={{ cursor: 'default' }}>food ×{org.memory_count?.food ?? 0}</span>
        </Tooltip>
        <Tooltip
          tip={`${org.memory_count?.water ?? 0} water source locations remembered - organism navigates toward these when thirsty`}
        >
          <span style={{ cursor: 'default' }}>water ×{org.memory_count?.water ?? 0}</span>
        </Tooltip>
        <Tooltip
          tip={`${org.memory_count?.danger ?? 0} danger zones remembered - organism avoids these areas when possible`}
        >
          <span style={{ cursor: 'default' }}>danger ×{org.memory_count?.danger ?? 0}</span>
        </Tooltip>
      </div>
    </>
  )
}

export function DeathSection({ org }: { org: OrganismState }) {
  const line = deathLine(org)
  if (!line) return null
  return (
    <>
      <div className="org-detail-section">DEATH</div>
      <div className="thought-row" style={{ marginBottom: 6 }}>
        <span className="thought-text">{line}</span>
      </div>
    </>
  )
}

/** The person's story in a few plain sentences, from what the card already knows. */
export function LifeStorySection({
  org,
  organisms,
  detail,
}: {
  org: OrganismState
  organisms?: OrganismState[]
  detail: OrgDetail | null
}) {
  const lines = lifeStory(org, organisms ?? [], detail?.life_log ?? [])
  const family = familySentence(org, organisms ?? [])
  return (
    <>
      <div className="org-detail-section">STORY</div>
      <ul className="life-story">
        {lines.map((line, i) => (
          <li key={i} className="thought-text">
            {line}
          </li>
        ))}
        {family && (
          <li className="thought-text" style={{ color: '#9fb7c9' }}>
            {family}
          </li>
        )}
      </ul>
    </>
  )
}

export function RecentLifeSection({ detail }: { detail: OrgDetail | null }) {
  const history = [...(detail?.thought_history ?? [])]
    .filter((e) => !['observing', 'satisfied', 'exploring'].includes(e.text))
    .slice(-12)
    .reverse()
  return (
    <>
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
    </>
  )
}

export function WitnessedSection({ detail }: { detail: OrgDetail | null }) {
  const witnessed = [...(detail?.life_log ?? [])]
    .filter((e) => e.category === 'witnessed')
    .slice(-8)
    .reverse()
  return (
    <>
      {witnessed.length > 0 && (
        <>
          <div className="org-detail-section">WHAT THEY'VE SEEN</div>
          <div className="thought-history">
            {witnessed.map((e, i) => (
              <div key={i} className="thought-row">
                <span className="thought-tick">t{e.tick.toLocaleString()}</span>
                <span className="thought-text" style={{ color: '#bfa9d6' }}>
                  {e.text}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export function InnerLifeSection({ detail }: { detail: OrgDetail | null }) {
  return (
    <>
      {detail?.memories &&
        detail.memories.length > 0 &&
        (() => {
          const mems = detail.memories
          const oldest = [...mems].sort((a, b) => a.tick - b.tick)[0]
          const proudest = [...mems]
            .filter((m) => m.kind !== 'core' && m.emotion >= 2)
            .sort((a, b) => b.salience - a.salience)[0]
          const heaviest = [...mems]
            .filter((m) => m.kind !== 'core' && m.emotion <= -2)
            .sort((a, b) => b.salience - a.salience)[0]
          if (!oldest && !proudest && !heaviest) return null
          return (
            <>
              <div className="org-detail-section">INNER LIFE</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0', fontSize: 11 }}
              >
                {oldest && oldest.kind !== 'core' && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>oldest mem:</span>
                    <span style={{ color: '#a8c0e0' }}>{oldest.text}</span>
                  </div>
                )}
                {proudest && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>proudest:</span>
                    <span style={{ color: '#f6c46a' }}>{proudest.text}</span>
                  </div>
                )}
                {heaviest && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>heaviest:</span>
                    <span style={{ color: '#6090c0' }}>{heaviest.text}</span>
                  </div>
                )}
              </div>
            </>
          )
        })()}
    </>
  )
}
