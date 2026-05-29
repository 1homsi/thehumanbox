import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { useSimulation } from './simulation/useSimulation'
import { getWorldSource } from './simulation/worldSource'
import { SandboxToolbar } from './components/SandboxToolbar'
import type { SandboxTool } from './simulation/sandbox'
import { IdleResumeOverlay } from './components/IdleResumeOverlay'
import { DesktopDownloadToast } from './components/DesktopDownloadToast'
import { CommandPalette } from './components/CommandPalette'
import { HeadlineTicker } from './components/HeadlineTicker'
import { trackEvent } from './lib/observability'
import { useUIStore } from './stores/store'
import { WS_BASE } from './lib/config'

const WS_HOST = WS_BASE.replace(/^wss?:\/\//, '')
import { WorldView } from './2d/world/WorldView'
import { EventLog } from './components/EventLog'
import { HistoryGrid } from './components/HistoryGrid'
import { LineagesList } from './components/LineagesList'
import { WorldFooter } from './components/WorldFooter'
import { AppHeader } from './components/AppHeader'
import { RightPanel } from './components/RightPanel'
import { ModalRouter } from './components/ModalRouter'
import { ThreeDLoading } from './components/ThreeDLoading'
import { Try3DToast } from './components/Try3DToast'
import { MobileBanner } from './components/MobileBanner'
import { WelcomeModal } from './components/WelcomeModal'
import { UpdateToast } from './components/UpdateToast'
import { DesktopUpdateToast } from './components/DesktopUpdateToast'
import { SceneView } from './scenes'
import { useCurrentScene } from './stores/scene'
import { HistoricalApp } from './HistoricalApp'
import type { OrganismState } from './types'
import clsx from 'clsx'
import './App.css'

const WorldView3D = lazyWithRetry(() => import('./3d/world/WorldView3D'))

const TILE_FIRE = 4

const HISTORICAL_ROUTE = /^\/world\/([a-f0-9]{6,16})\/?$/

function App() {
  const match = typeof window !== 'undefined' ? HISTORICAL_ROUTE.exec(window.location.pathname) : null
  if (match) {
    return <HistoricalApp hash={match[1]} />
  }
  return <LiveApp />
}

function LiveApp() {
  const worldSourceRef = useRef(getWorldSource())
  const {
    world,
    connected,
    status,
    failedAttempts,
    interp,
    idleParked,
    resume,
    sandboxAvailable,
    sendCommand,
    pauseSim,
    setSpeed,
  } = useSimulation(worldSourceRef.current)
  const currentScene = useCurrentScene()

  const [armedTool, setArmedTool] = useState<SandboxTool | null>(null)
  const [brush, setBrush] = useState(2)

  const onPickTool = useCallback(
    (tool: SandboxTool) => {
      if (tool.mode === 'instant') {
        if (tool.time) {
          if (tool.time.control === 'pause') pauseSim()
          else if (tool.time.control === 'resume') resume()
          else if (tool.time.control === 'speed' && tool.time.mult) setSpeed(tool.time.mult)
        } else if (tool.fire) {
          sendCommand(tool.fire)
        }
        return
      }
      setArmedTool((prev) => (prev?.id === tool.id ? null : tool))
    },
    [pauseSim, resume, setSpeed, sendCommand],
  )

  const handleSandboxApply = useCallback(
    (wx: number, wy: number) => {
      if (armedTool?.build) sendCommand(armedTool.build(Math.round(wx), Math.round(wy), brush))
    },
    [armedTool, brush, sendCommand],
  )

  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const openDesktopSettings = useUIStore((s) => s.openDesktopSettings)

  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    return desk.on('menu:openSettings', () => openDesktopSettings())
  }, [openDesktopSettings])

  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    return desk.on('app:visibility', (payload) => {
      const v = payload as unknown as string
      if (v === 'minimized') {
        document.body.classList.add('thb-app-minimized')
      } else {
        document.body.classList.remove('thb-app-minimized')
      }
    })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      const orgs = world?.organisms.filter((o) => o.alive)
      if (!orgs || orgs.length === 0) return
      e.preventDefault()
      const dir = e.shiftKey ? -1 : 1
      const currentIdx = selectedOrgId ? orgs.findIndex((o) => o.id === selectedOrgId) : -1
      const next = orgs[(currentIdx + dir + orgs.length) % orgs.length]
      if (next) {
        useUIStore.getState().selectOrg(next.id)
        useUIStore.getState().followOrg(next.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [world, selectedOrgId])

  const lastHeadlineTickRef = useRef<number>(0)
  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    if (!world?.headlines || world.headlines.length === 0) return
    const newest = world.headlines[0]
    if (!newest || typeof newest.tick !== 'number') return
    if (newest.tick <= lastHeadlineTickRef.current) return
    lastHeadlineTickRef.current = newest.tick
    if (document.visibilityState !== 'visible' || document.body.classList.contains('thb-app-minimized')) {
      void desk.app.notify({ title: 'The Human Box', body: newest.text })
    }
  }, [world?.headlines])

  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if (world && !splashHiddenRef.current) {
      splashHiddenRef.current = true
      window.dispatchEvent(new Event('thb-world-ready'))
      trackEvent('world_first_loaded', {
        tick: world.tick,
        alive: world.organisms.filter((o) => o.alive).length,
      })
    }
  }, [world])

  useEffect(() => {
    if (viewFlags.threeD && viewFlags.hideUI) {
      document.body.classList.add('thb-3d-immersive')
    } else {
      document.body.classList.remove('thb-3d-immersive')
    }
    return () => {
      document.body.classList.remove('thb-3d-immersive')
    }
  }, [viewFlags.threeD, viewFlags.hideUI])

  useEffect(() => {
    if (viewFlags.photoMode) document.body.classList.add('thb-photo-mode')
    else document.body.classList.remove('thb-photo-mode')
    return () => {
      document.body.classList.remove('thb-photo-mode')
    }
  }, [viewFlags.photoMode])

  useEffect(() => {
    if (viewFlags.colorBlind) document.body.classList.add('thb-colorblind')
    else document.body.classList.remove('thb-colorblind')
    return () => {
      document.body.classList.remove('thb-colorblind')
    }
  }, [viewFlags.colorBlind])

  const selectedOrg = selectedOrgId ? (world?.organisms.find((o) => o.id === selectedOrgId) ?? null) : null

  const fireTiles = useMemo(
    () => (world ? world.grid.tiles.reduce((n, row) => n + row.filter((t) => t === TILE_FIRE).length, 0) : 0),
    [world],
  )

  const sickOrgs = useMemo(
    () => (world ? world.organisms.filter((o) => o.alive && o.infection > 0.15).length : 0),
    [world],
  )

  const liveOrgs = useMemo(() => (world ? world.organisms.filter((o) => o.alive) : []), [world])
  const deadOrgs = useMemo(() => (world ? world.organisms.filter((o) => !o.alive) : []), [world])

  const liveOrgsRef = useRef<OrganismState[]>([])
  useEffect(() => {
    liveOrgsRef.current = liveOrgs
  }, [liveOrgs])
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
    const result: Record<string, { count: number; minGen: number; maxGen: number; orgs: OrganismState[] }> =
      {}
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
      <AppHeader world={world ?? null} connected={connected} fireTiles={fireTiles} sickOrgs={sickOrgs} />
      <HeadlineTicker world={world ?? null} enabled={viewFlags.headlineTicker} />

      {idleParked && <IdleResumeOverlay onResume={resume} />}
      <DesktopDownloadToast />
      <CommandPalette />

      <main className="main" data-tour="world-canvas">
        {world ? (
          <div className="layout">
            {(!viewFlags.threeD || !viewFlags.hideUI) && (
              <>
                {leftOpen && <div className="panel-overlay panel-overlay-left" onClick={toggleLeft} />}
                <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
                  <HistoryGrid />
                  <LineagesList />
                  <EventLog />
                  <WorldFooter world={world} />
                </aside>
              </>
            )}

            {currentScene ? (
              <SceneView world={world} />
            ) : viewFlags.threeD ? (
              <Suspense fallback={<ThreeDLoading />}>
                <WorldView3D world={world} hideUI={viewFlags.hideUI} />
              </Suspense>
            ) : (
              <WorldView
                world={world}
                interp={interp}
                sandboxArmed={!!armedTool}
                onSandboxApply={handleSandboxApply}
              />
            )}

            <RightPanel world={world} liveOrgs={liveOrgs} deadOrgs={deadOrgs} selectedOrg={selectedOrg} />
          </div>
        ) : (
          <div className="waiting">
            <div className="waiting-spinner" aria-hidden="true" />
            <div className="waiting-title">
              {status === 'unreachable'
                ? 'simulation server unreachable'
                : status === 'reconnecting'
                  ? 'reconnecting…'
                  : 'connecting…'}
            </div>
            <div className="waiting-sub">
              {status === 'unreachable'
                ? `tried ${failedAttempts} times. waiting for ${WS_HOST} to come back online - retries continue automatically.`
                : status === 'reconnecting'
                  ? `attempt ${failedAttempts + 1} - backing off and retrying`
                  : 'opening websocket and fetching the world snapshot'}
            </div>
          </div>
        )}
      </main>

      {world && sandboxAvailable && (
        <SandboxToolbar
          armedToolId={armedTool?.id ?? null}
          brush={brush}
          onBrush={setBrush}
          onPick={onPickTool}
          onClearArmed={() => setArmedTool(null)}
        />
      )}

      {world && <ModalRouter world={world} lineages={lineages} />}

      {world && <Try3DToast />}
      <MobileBanner />
      {world && <WelcomeModal />}
      <UpdateToast />
      <DesktopUpdateToast />
    </div>
  )
}

export default App
