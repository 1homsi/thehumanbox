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
import { ActionTicker } from './components/ActionTicker'
import { ThreeDLoading } from './components/ThreeDLoading'
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

  // Photo mode: hide every chrome element so only the canvas shows.
  // The header reappears on hover via :hover rule on .header itself,
  // so the user can still toggle the mode off.
  useEffect(() => {
    if (viewFlags.photoMode) document.body.classList.add('thb-photo-mode')
    else document.body.classList.remove('thb-photo-mode')
    return () => { document.body.classList.remove('thb-photo-mode') }
  }, [viewFlags.photoMode])

  // Color-blind body class so the CSS variables / canvas reads can
  // also branch on it without each component subscribing.
  useEffect(() => {
    if (viewFlags.colorBlind) document.body.classList.add('thb-colorblind')
    else document.body.classList.remove('thb-colorblind')
    return () => { document.body.classList.remove('thb-colorblind') }
  }, [viewFlags.colorBlind])

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

  // Random tour: every 8s pick a different alive organism, select it
  // and follow it. We close over liveOrgs through a ref so the timer
  // body sees the latest cohort without resetting the interval on
  // every WS tick.
  const liveOrgsRef = useRef<OrganismState[]>([])
  useEffect(() => { liveOrgsRef.current = liveOrgs }, [liveOrgs])
  useEffect(() => {
    if (!viewFlags.randomTour) return
    const tick = () => {
      const pool = liveOrgsRef.current
      if (pool.length === 0) return
      const pick = pool[Math.floor(Math.random() * pool.length)]
      useUIStore.getState().selectOrg(pick.id)
      useUIStore.getState().followOrg(pick.id)
    }
    tick()
    const id = window.setInterval(tick, 8000)
    return () => window.clearInterval(id)
  }, [viewFlags.randomTour])

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
              <Suspense fallback={<ThreeDLoading />}>
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

      {world && viewFlags.actionTicker && <ActionTicker world={world} />}

      {world && <ModalRouter world={world} lineages={lineages} />}
    </div>
  )
}

export default App
