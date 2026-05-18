import { useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useSimulation } from './useSimulation'
import { useUIStore } from './store'
import { WorldView } from './WorldView'
import { EventLog } from './components/EventLog'
import { HistoryGrid } from './components/HistoryGrid'
import { LineagesList } from './components/LineagesList'
import { WorldFooter } from './components/WorldFooter'
import { AppHeader } from './components/AppHeader'
import { RightPanel } from './components/RightPanel'
import { ModalRouter } from './components/ModalRouter'
import type { OrganismState } from './types'
import clsx from 'clsx'
import './App.css'

// 3D world is a separate chunk - 2D-only users never download it.
// Lazy because @react-three/* + three.js add ~150 KB gzipped that the
// default 2D path shouldn't pay for.
const WorldView3D = lazy(() => import('./WorldView3D'))

const TILE_FIRE = 4

function App() {
  const { world, connected, interp } = useSimulation()

  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const leftOpen      = useUIStore(s => s.leftOpen)
  const viewFlags     = useUIStore(s => s.viewFlags)

  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if (world && !splashHiddenRef.current) {
      splashHiddenRef.current = true
      window.dispatchEvent(new Event('thb-world-ready'))
    }
  }, [world])

  // Body class for 3D-immersive mode so CSS can definitively hide
  // every panel + sidebar regardless of internal state. Cleaner
  // than per-component conditionals that can be defeated by
  // stacking context / z-index quirks.
  useEffect(() => {
    if (viewFlags.threeD && viewFlags.hideUI) {
      document.body.classList.add('thb-3d-immersive')
    } else {
      document.body.classList.remove('thb-3d-immersive')
    }
    return () => { document.body.classList.remove('thb-3d-immersive') }
  }, [viewFlags.threeD, viewFlags.hideUI])

  const selectedOrg = selectedOrgId
    ? world?.organisms.find(o => o.id === selectedOrgId) ?? null
    : null

  const fireTiles = useMemo(() =>
    world ? world.grid.tiles.reduce((n, row) => n + row.filter(t => t === TILE_FIRE).length, 0) : 0
  , [world])

  const sickOrgs = useMemo(() =>
    world ? world.organisms.filter(o => o.alive && o.infection > 0.15).length : 0
  , [world])

  const liveOrgs = useMemo(() => world ? world.organisms.filter(o =>  o.alive) : [], [world])
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
    <div className="app">
      <AppHeader
        world={world ?? null}
        connected={connected}
        fireTiles={fireTiles}
        sickOrgs={sickOrgs}
      />

      <main className="main">
        {world ? (
          <div className="layout">

            {(!viewFlags.threeD || !viewFlags.hideUI) && (
              <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
                <HistoryGrid />
                <LineagesList />
                <EventLog />
                <WorldFooter world={world} />
              </aside>
            )}

            {viewFlags.threeD ? (
              <Suspense fallback={
                <div style={{ position: 'fixed', inset: 0, display: 'grid',
                              placeItems: 'center', color: '#cad3df',
                              fontFamily: 'monospace', background: '#0c1018' }}>
                  loading 3D…
                </div>
              }>
                <WorldView3D world={world} hideUI={viewFlags.hideUI} />
              </Suspense>
            ) : (
              <WorldView
                world={world}
                interp={interp}
              />
            )}

            <RightPanel
              world={world}
              liveOrgs={liveOrgs}
              deadOrgs={deadOrgs}
              selectedOrg={selectedOrg}
            />

          </div>
        ) : (
          <div className="waiting">waiting for simulation...</div>
        )}
      </main>

      {world && <ModalRouter world={world} lineages={lineages} />}
    </div>
  )
}

export default App
