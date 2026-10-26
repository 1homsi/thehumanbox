import type { OrgDetail } from '../../../shared/types'
import { t } from '../../../i18n'
import { RELATION_LABEL, wordHistoryRows } from './word-history-rows'

/** The person's words for common things, beside their parents' and grandparents' words. */
export function WordHistorySection({ detail }: { detail: OrgDetail | null }) {
  const rows = wordHistoryRows(detail)
  if (rows.length === 0) return null
  return (
    <>
      <div className="org-detail-section">{t('person.words.title')}</div>
      <div className="word-history-intro">{t('person.words.intro')}</div>
      {rows.map((row) => (
        <div key={row.concept} className={`word-history-row${row.drifted ? ' drifted' : ''}`}>
          <div className="word-history-head">
            <span className="vocab-concept">{row.concept}</span>
            <span className="word-history-tag">
              {row.drifted ? t('person.words.drifted') : t('person.words.same')}
            </span>
          </div>
          <div className="word-history-words">
            <span className="word-history-chip">
              <i>{t('person.words.you')}</i> <b>{row.own}</b>
            </span>
            {row.relatives.map((r) => (
              <span
                key={r.id}
                className={`word-history-chip${r.word !== null && r.word !== row.own ? ' differs' : ''}`}
                title={r.remembered ? r.name : t('person.words.unknown')}
              >
                <i>{t(RELATION_LABEL[r.relation])}</i>{' '}
                <b>{r.remembered ? (r.word ?? '—') : t('person.words.unknown')}</b>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
