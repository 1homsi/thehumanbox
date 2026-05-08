import type { OrganismState } from '../types'
import { lineageColor } from '../constants'

const CONCEPTS = [
  'food', 'water', 'fire', 'danger', 'friend',
  'foe', 'shelter', 'hunt', 'night', 'day',
  'sick', 'home', 'group', 'alone',
]

interface Props {
  organisms: OrganismState[]
  sexWords?: [string, string]   // [0]=male word, [1]=female word
  onClose: () => void
}

interface LineageVocab {
  lineageId: string
  words: Record<string, string>   // concept → most common word in this lineage
  count: number
}

function buildLineageVocabs(organisms: OrganismState[]): LineageVocab[] {
  const byLineage: Record<string, OrganismState[]> = {}
  for (const org of organisms) {
    if (!byLineage[org.lineage_id]) byLineage[org.lineage_id] = []
    byLineage[org.lineage_id].push(org)
  }

  return Object.entries(byLineage)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([lid, orgs]) => {
      const words: Record<string, string> = {}
      for (const concept of CONCEPTS) {
        const counts: Record<string, number> = {}
        for (const org of orgs) {
          const w = org.vocabulary?.[concept]
          if (w) counts[w] = (counts[w] ?? 0) + 1
        }
        const entries = Object.entries(counts)
        if (entries.length) {
          words[concept] = entries.sort((a, b) => b[1] - a[1])[0][0]
        }
      }
      return { lineageId: lid, words, count: orgs.length }
    })
}

export function LanguageModal({ organisms, sexWords, onClose }: Props) {
  const lineages = buildLineageVocabs(organisms)

  return (
    <div className="lang-modal-backdrop" onClick={onClose}>
      <div className="lang-modal" onClick={e => e.stopPropagation()}>
        <div className="lang-modal-header">
          <span className="lang-modal-title">LANGUAGES OF THE WORLD</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="lang-modal-body">
          <p className="lang-modal-sub">
            Each lineage develops its own words. Words mutate across generations and spread through contact.
          </p>

          {sexWords && (
            <div className="lang-sex-words">
              <span className="lang-sex-label">their words for the two kinds:</span>
              <span className="lang-sex-word lang-sex-word-0">{sexWords[0]}</span>
              <span className="lang-sex-divider">·</span>
              <span className="lang-sex-word lang-sex-word-1">{sexWords[1]}</span>
              <span className="lang-sex-note">(coined by the founding generation)</span>
            </div>
          )}

          <div className="lang-table-wrap">
            <div
              className="lang-table"
              style={{ gridTemplateColumns: `70px repeat(${lineages.length}, 1fr)` }}
            >
              <div className="lang-th lang-concept-col">concept</div>
              {lineages.map(l => (
                <div key={l.lineageId} className="lang-th lang-lineage-col">
                  <span className="lang-lineage-dot" style={{ background: lineageColor(l.lineageId) }} />
                  {l.lineageId.slice(0, 6)}
                  <span className="lang-lineage-count">×{l.count}</span>
                </div>
              ))}

              {CONCEPTS.map(concept => (
                <>
                  <div key={`eng-${concept}`} className="lang-td lang-concept-col lang-english">
                    {concept}
                  </div>
                  {lineages.map(l => (
                    <div key={`${l.lineageId}-${concept}`} className="lang-td lang-lineage-col lang-word">
                      {l.words[concept] ?? <span className="lang-unknown">—</span>}
                    </div>
                  ))}
                </>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
