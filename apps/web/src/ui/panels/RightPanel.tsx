import { personName } from '../../shared/personName'
import { Suspense, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { OrganismState, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { lazyWithRetry as lazy } from '../../shared/lazyWithRetry'
import { shownGeneration } from '../../game/model/generations'
import { ageInYears } from '../../game/model/calendar'
import { formatNumber, t } from '../../i18n'

const loadOrgCard = () => import('./OrgCard')
const loadPersonDrawer = () => import('./PersonDrawer')
const OrgCard = lazy(() => loadOrgCard().then((m) => ({ default: m.OrgCard })))
const PersonDrawer = lazy(() => loadPersonDrawer().then((m) => ({ default: m.PersonDrawer })))
if (typeof window !== 'undefined') {
  const prefetch = () => {
    void loadOrgCard().catch(() => undefined)
    void loadPersonDrawer().catch(() => undefined)
  }
  window.setTimeout(prefetch, 1500)
}

interface Props {
  world: WorldState
  liveOrgs: OrganismState[]
  deadOrgs: OrganismState[]
  selectedOrg: OrganismState | null
}

export const PEOPLE_PAGE_SIZE = 20

function useThrottledValue<T>(value: T, active: boolean, intervalMs = 200): T {
  const [throttled, setThrottled] = useState(value)
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  useEffect(() => {
    if (!active) return
    setThrottled(latest.current)
    const id = setInterval(() => setThrottled(latest.current), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return throttled
}

function LoadMore({ onMore, label, shown }: { onMore: () => void; label: string; shown: number }) {
  const button = useRef<HTMLButtonElement>(null)
  const more = useRef(onMore)
  useEffect(() => {
    more.current = onMore
  }, [onMore])
  useEffect(() => {
    const el = button.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const root = el.closest('.panel-right')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more.current()
      },
      { root, rootMargin: '0px 0px 600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [shown])
  return (
    <button ref={button} type="button" className="view-all-btn people-load-more" onClick={onMore}>
      {label}
    </button>
  )
}

export function RightPanel({ world, liveOrgs, deadOrgs, selectedOrg }: Props) {
  const panelOpen = useUIStore((s) => s.panelOpen)
  const throttledLive = useThrottledValue(liveOrgs, panelOpen)
  const throttledDead = useThrottledValue(deadOrgs, panelOpen)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const starredOrgIds = useUIStore((s) => s.starredOrgIds)
  const showStarredOnly = useUIStore((s) => s.showStarredOnly)
  const toggleShowStarred = useUIStore((s) => s.toggleShowStarredOnly)
  const [visibleLimit, setVisibleLimit] = useState(PEOPLE_PAGE_SIZE)
  const starredSet = new Set(starredOrgIds)
  const visibleLive = !panelOpen
    ? []
    : showStarredOnly
      ? throttledLive.filter((o) => starredSet.has(o.id))
      : throttledLive
  const renderedLive = visibleLive.slice(0, visibleLimit)
  const hidden = visibleLive.length - renderedLive.length
  const visibleDead = !panelOpen
    ? []
    : showStarredOnly
      ? throttledDead.filter((o) => starredSet.has(o.id))
      : throttledDead
  const knownIds = new Set<string>()
  if (panelOpen && showStarredOnly) {
    for (const o of throttledLive) knownIds.add(o.id)
    for (const o of throttledDead) knownIds.add(o.id)
  }
  const starredGone = panelOpen && showStarredOnly ? starredOrgIds.filter((id) => !knownIds.has(id)) : []

  useEffect(() => {
    setVisibleLimit(PEOPLE_PAGE_SIZE)
  }, [showStarredOnly, panelOpen])

  return (
    <>
      {selectedOrg && (
        <Suspense fallback={null}>
          <PersonDrawer key="person" org={selectedOrg} world={world} />
        </Suspense>
      )}
      {panelOpen && <div className="panel-overlay" onClick={togglePanel} />}
      <aside data-tour="right-panel" className={clsx('panel', 'panel-right', panelOpen && 'open')}>
        {panelOpen && (
          <Suspense fallback={null}>
            <div className="section-title-row">
              <span className="section-title">
                {t('panels.right.alive', { count: formatNumber(visibleLive.length) })}
              </span>
              <button
                type="button"
                className={clsx('starred-toggle', showStarredOnly && 'active')}
                onClick={toggleShowStarred}
                title={
                  showStarredOnly
                    ? t('panels.right.showAll')
                    : t('panels.right.showStarred', { count: formatNumber(starredOrgIds.length) })
                }
              >
                {showStarredOnly
                  ? `★ ${t('panels.right.starred')}`
                  : `☆ ${formatNumber(starredOrgIds.length)}`}
              </button>
            </div>
            <div className="people-list">
              {renderedLive.map((org) => (
                <OrgCard key={org.id} orgId={org.id} />
              ))}
            </div>
            {hidden > 0 && (
              <LoadMore
                shown={renderedLive.length}
                onMore={() => setVisibleLimit((limit) => limit + PEOPLE_PAGE_SIZE)}
                label={t('panels.right.showMore', {
                  count: formatNumber(Math.min(PEOPLE_PAGE_SIZE, hidden)),
                  hidden: formatNumber(hidden),
                })}
              />
            )}

            {visibleDead.length > 0 && (
              <>
                <div className="section-title">
                  {t('panels.right.dead', { count: formatNumber(visibleDead.length) })}
                </div>
                {(showStarredOnly ? visibleDead : visibleDead.slice(-5)).map((org) => (
                  <div key={org.id} className="org-card dead">
                    <div className="org-header">
                      <button
                        type="button"
                        className="person-card-name"
                        onClick={() => useUIStore.getState().selectOrg(org.id)}
                      >
                        {personName(org)}
                      </button>
                      <span className="org-meta">
                        {t('panels.right.generation', {
                          generation: formatNumber(shownGeneration(org.generation)),
                          age: ageInYears(org.age),
                        })}
                      </span>
                      {starredSet.has(org.id) && (
                        <button
                          type="button"
                          className="unstar-dead-btn"
                          onClick={() => useUIStore.getState().toggleStar(org.id)}
                          title={t('panels.right.unstar')}
                        >
                          ★
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {starredGone.length > 0 && (
              <>
                <div className="section-title">
                  {t('panels.right.gone', { count: formatNumber(starredGone.length) })}
                </div>
                {starredGone.map((id) => (
                  <div key={id} className="org-card dead">
                    <div className="org-header">
                      <span className="org-name">{id.slice(0, 8)}</span>
                      <span className="org-meta">{t('panels.right.vanished')}</span>
                      <button
                        type="button"
                        className="unstar-dead-btn"
                        onClick={() => useUIStore.getState().toggleStar(id)}
                        title={t('panels.right.unstar')}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Suspense>
        )}
      </aside>
    </>
  )
}
