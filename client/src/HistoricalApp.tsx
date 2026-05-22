import { useMemo } from 'react'
import { useHistoricalWorld } from './simulation/useHistoricalWorld'
import { useUIStore } from './stores/store'
import { WorldView } from './2d/world/WorldView'
import { RightPanel } from './components/RightPanel'
import { HistoryGrid } from './components/HistoryGrid'
import { LineagesList } from './components/LineagesList'
import { EventLog } from './components/EventLog'
import { WorldFooter } from './components/WorldFooter'
import { AppHeader } from './components/AppHeader'
import { ModalRouter } from './components/ModalRouter'
import { HistoricalBanner } from './components/HistoricalBanner'
import { UpdateToast } from './components/UpdateToast'
import type { OrganismState } from './types'
import clsx from 'clsx'

interface Props {
  hash: string
}

export function HistoricalApp({ hash }: Props) {
  const { loading, error, world, meta } = useHistoricalWorld(hash)
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const leftOpen      = useUIStore(s => s.leftOpen)
  const toggleLeft    = useUIStore(s => s.toggleLeft)

  const selectedOrg = selectedOrgId && world
    ? world.organisms.find(o => o.id === selectedOrgId) ?? null
    : null

  const liveOrgs = useMemo(() => world ? world.organisms.filter(o => o.alive) : [], [world])
  const deadOrgs = useMemo(() => world ? world.organisms.filter(o => !o.alive) : [], [world])

  const lineages = useMemo(() => {
    const result: Record<string, { count: number; minGen: number; maxGen: number; orgs: OrganismState[] }> = {}
    if (!world) return result
    for (const org of liveOrgs) {
      if (!result[org.lineage_id]) {
        result[org.lineage_id] = { count: 0, minGen: org.generation, maxGen: org.generation, orgs: [] }
      }
      result[org.lineage_id].count++
      result[org.lineage_id].orgs.push(org)
      result[org.lineage_id].minGen = Math.min(result[org.lineage_id].minGen, org.generation)
      result[org.lineage_id].maxGen = Math.max(result[org.lineage_id].maxGen, org.generation)
    }
    return result
  }, [world, liveOrgs])

  return (
    <div className={clsx('app', 'app--historical')}>
      <HistoricalBanner meta={meta} hash={hash} />
      <AppHeader world={world ?? null} connected={!loading && !!world} fireTiles={0} sickOrgs={0} />

      <main className="main">
        {world ? (
          <div className="layout">
            {leftOpen && (
              <div className="panel-overlay panel-overlay-left" onClick={toggleLeft} />
            )}
            <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
              <HistoryGrid />
              <LineagesList />
              <EventLog />
              <WorldFooter world={world} />
            </aside>
            <WorldView world={world} interp={undefined} />
            <RightPanel
              world={world}
              liveOrgs={liveOrgs}
              deadOrgs={deadOrgs}
              selectedOrg={selectedOrg}
            />
          </div>
        ) : (
          <div className="waiting">
            <div className="waiting-spinner" aria-hidden="true" />
            <div className="waiting-title">
              {error ? 'could not load this world' : 'loading historical world…'}
            </div>
            <div className="waiting-sub">
              {error
                ? error
                : `fetching ${hash} from the archive`}
            </div>
          </div>
        )}
      </main>

      {world && <ModalRouter world={world} lineages={lineages} />}
      <UpdateToast />
    </div>
  )
}
