import type { OrgDetail } from '../../../shared/types'

export function LanguageSection({ detail }: { detail: OrgDetail | null }) {
  return (
    <>
      {detail?.vocabulary && Object.keys(detail.vocabulary).length > 0 && (
        <>
          <div className="org-detail-section">THEIR LANGUAGE</div>
          <div className="vocab-grid">
            {Object.entries(detail.vocabulary).map(([concept, word]) => (
              <div key={concept} className="vocab-row">
                <span className="vocab-word">{word}</span>
                <span className="vocab-concept">{concept}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
