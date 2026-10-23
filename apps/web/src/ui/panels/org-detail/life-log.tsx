import { deathLine } from '../../../game/model/death'
import { lifeStory } from '../../../game/model/life-story'
import { familySentence } from '../../../game/model/family-lines'
import { Tooltip } from '../../toolbar/Tooltip'
import type { OrganismState, OrgDetail } from '../../../shared/types'
import { formatNumber, t } from '../../../i18n'

export function MemoryCountsSection({ org }: { org: OrganismState }) {
  return (
    <>
      <div className="org-detail-section">{t('person.life.memory')}</div>
      <div className="org-memory" style={{ marginBottom: 6 }}>
        <Tooltip tip={t('person.life.foodTip', { count: formatNumber(org.memory_count?.food ?? 0) })}>
          <span style={{ cursor: 'default' }}>
            {t('person.life.food', { count: formatNumber(org.memory_count?.food ?? 0) })}
          </span>
        </Tooltip>
        <Tooltip tip={t('person.life.waterTip', { count: formatNumber(org.memory_count?.water ?? 0) })}>
          <span style={{ cursor: 'default' }}>
            {t('person.life.water', { count: formatNumber(org.memory_count?.water ?? 0) })}
          </span>
        </Tooltip>
        <Tooltip tip={t('person.life.dangerTip', { count: formatNumber(org.memory_count?.danger ?? 0) })}>
          <span style={{ cursor: 'default' }}>
            {t('person.life.danger', { count: formatNumber(org.memory_count?.danger ?? 0) })}
          </span>
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
      <div className="org-detail-section">{t('person.life.death')}</div>
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
      <div className="org-detail-section">{t('person.life.story')}</div>
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
          <div className="org-detail-section">{t('person.life.recent')}</div>
          <div className="thought-history">
            {history.map((e, i) => (
              <div key={i} className="thought-row">
                <span className="thought-tick">{t('person.life.tick', { tick: formatNumber(e.tick) })}</span>
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
          <div className="org-detail-section">{t('person.life.witnessed')}</div>
          <div className="thought-history">
            {witnessed.map((e, i) => (
              <div key={i} className="thought-row">
                <span className="thought-tick">{t('person.life.tick', { tick: formatNumber(e.tick) })}</span>
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
              <div className="org-detail-section">{t('person.life.innerLife')}</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0', fontSize: 11 }}
              >
                {oldest && oldest.kind !== 'core' && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>
                      {t('person.life.oldest')}
                    </span>
                    <span style={{ color: '#a8c0e0' }}>{oldest.text}</span>
                  </div>
                )}
                {proudest && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>
                      {t('person.life.proudest')}
                    </span>
                    <span style={{ color: '#f6c46a' }}>{proudest.text}</span>
                  </div>
                )}
                {heaviest && (
                  <div>
                    <span style={{ color: '#666', minWidth: 90, display: 'inline-block' }}>
                      {t('person.life.heaviest')}
                    </span>
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
