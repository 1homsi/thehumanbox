import { Fragment, useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { useSimulation } from './simulation/useSimulation'
import {
  getWorldSource,
  reloadAppSafely,
  requestOwnWorldReset,
  resolvePlayerWorldKind,
  shouldUseSimulationApi,
} from './simulation/worldSource'
import { SimulationDataProvider } from './simulation/SimulationDataProvider'
import { SandboxToolbar } from './components/SandboxToolbar'
import { PhotoModeExit } from './components/PhotoModeExit'
import { ConfirmHost } from './components/ConfirmDialog'
import { WorldSilent } from './components/WorldSilent'
import { PrayerHint } from './components/PrayerHint'
import { TribeCard } from './components/TribeCard'
import { askConfirm } from './lib/confirm'
import { toolFailure } from './components/tool-tips'
import { SANDBOX_CATEGORIES, type LineageStrategy, type SandboxTool } from './simulation/sandbox'
import { newPerils } from './world/peril-watch'
import { prayerRows, prayerTool } from './world/prayers'
import { shortcutFor, typingTarget } from './world/shortcuts'
import { tribeHome } from './world/tribe-peril'
import { useCameraFocus } from './stores/camera-focus'
import type { PrayerInfo } from './types'
import { DesktopDownloadToast } from './components/DesktopDownloadToast'
import { CommandPalette } from './components/CommandPalette'
import { HeadlineTicker } from './components/HeadlineTicker'
import { trackEvent } from './lib/observability'
import { reconcileViewerSelection } from './lib/viewerSelection'
import { useUIStore } from './stores/store'
import { IS_LOCAL_SERVER } from './lib/config'
import { getDesktop, type SimMode } from './lib/desktop'
import {
  DESKTOP_PAUSE_WHEN_HIDDEN_EVENT,
  isDesktopWindowInactive,
  parsePauseWhenHiddenPreference,
  shouldPauseDesktopRenderer,
} from './lib/desktopVisibility'

import { WorldView } from './2d/world/WorldView'
import { EventLog } from './components/EventLog'
import { HistoryGrid } from './components/HistoryGrid'
import { LineagesList } from './components/LineagesList'
import { WorldFooter } from './components/WorldFooter'
import { AppHeader } from './components/AppHeader'
import { RightPanel } from './components/RightPanel'
import { ModalRouter } from './components/ModalRouter'
import { MobileBanner } from './components/MobileBanner'
import { WelcomeModal } from './components/WelcomeModal'
import { UpdateToast } from './components/UpdateToast'
import { DesktopUpdateToast } from './components/DesktopUpdateToast'
import { useCurrentScene } from './stores/scene'
import type { OrganismState } from './types'
import clsx from 'clsx'
import './App.css'
import './pixel-theme.css'

const SceneView = lazyWithRetry(() =>
  import('./scenes/components/SceneView').then((m) => ({ default: m.SceneView })),
)
function App() {
  return <LiveApp />
}

function LiveApp() {
  const worldSourceRef = useRef(getWorldSource())
  const desktop = getDesktop()
  const isLocalWebWorld = !desktop && worldSourceRef.current === 'wasm'
  const [desktopMode, setDesktopMode] = useState<SimMode | null>(desktop ? null : 'local')
  const [desktopPauseWhenHidden, setDesktopPauseWhenHidden] = useState(true)
  const [desktopRendererPaused, setDesktopRendererPaused] = useState(false)
  const desktopWindowInactiveRef = useRef(false)
  const {
    world,
    connected,
    interp,
    resume,
    sandboxAvailable,
    sendCommand,
    pauseSim,
    setSpeed,
    runtimeState,
    localSaveStatus,
    saveLocalWorld,
    loadLocalOrgDetail,
    loadLocalOrgLife,
  } = useSimulation(worldSourceRef.current)
  const localStartupFailed = !world && localSaveStatus.phase === 'error' && localSaveStatus.fatal === true
  const playerWorldKind = resolvePlayerWorldKind(worldSourceRef.current, {
    desktop: !!desktop,
    desktopMode,
    localServer: IS_LOCAL_SERVER,
  })
  const simulationApiEnabled = shouldUseSimulationApi(worldSourceRef.current)
  const simulationData = useMemo(
    () => ({ apiEnabled: simulationApiEnabled, playerWorldKind, loadLocalOrgDetail, loadLocalOrgLife }),
    [loadLocalOrgDetail, loadLocalOrgLife, playerWorldKind, simulationApiEnabled],
  )
  const currentScene = useCurrentScene()

  const [armedTool, setArmedTool] = useState<SandboxTool | null>(null)
  const [brush, setBrush] = useState(2)
  const [sandboxStatus, setSandboxStatus] = useState<string | null>(null)
  const sandboxStatusTimer = useRef<number | null>(null)
  const sandboxControlsEnabled = sandboxAvailable && (!desktop || desktopMode === 'local')

  const setTemporarySandboxStatus = useCallback((message: string | null, ms = 1800) => {
    if (sandboxStatusTimer.current !== null) window.clearTimeout(sandboxStatusTimer.current)
    setSandboxStatus(message)
    if (message) {
      sandboxStatusTimer.current = window.setTimeout(() => {
        setSandboxStatus(null)
        sandboxStatusTimer.current = null
      }, ms)
    } else {
      sandboxStatusTimer.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (sandboxStatusTimer.current !== null) window.clearTimeout(sandboxStatusTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!desktop) return
    let alive = true
    let settingsRevision = 0
    const applyInitialSettings = (settings: { mode: SimMode; pauseWhenHidden: boolean }) => {
      if (!alive) return
      setDesktopMode(settings.mode)
      setDesktopPauseWhenHidden(settings.pauseWhenHidden)
    }
    void desktop.settings
      .get()
      .then((settings) => {
        if (settingsRevision === 0) applyInitialSettings(settings)
      })
      .catch(() => undefined)
    const onPreferenceChange = (event: Event) => {
      const next = parsePauseWhenHiddenPreference((event as CustomEvent<unknown>).detail)
      if (next === null) return
      settingsRevision += 1
      if (alive) setDesktopPauseWhenHidden(next)
    }
    window.addEventListener(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, onPreferenceChange)
    return () => {
      alive = false
      window.removeEventListener(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, onPreferenceChange)
    }
  }, [desktop])

  useEffect(() => {
    if (sandboxControlsEnabled) return
    setArmedTool(null)
    setTemporarySandboxStatus(null)
  }, [sandboxControlsEnabled, setTemporarySandboxStatus])

  const onPickTool = useCallback(
    (tool: SandboxTool) => {
      if (tool.view) {
        setArmedTool(null)
        const ui = useUIStore.getState()
        let enabled: boolean
        if (tool.view.control === 'overlay') {
          enabled = ui.overlay !== tool.view.value
          ui.setOverlay(enabled ? tool.view.value : null)
        } else if (tool.view.value === 'territory') {
          enabled = !ui.viewFlags.territory
          ui.setTerritoryView(enabled)
        } else {
          enabled = !ui.viewFlags[tool.view.value]
          ui.setViewFlag(tool.view.value, enabled)
        }
        setTemporarySandboxStatus(
          tool.id.endsWith('_view')
            ? `${tool.label} ${enabled ? 'shown' : 'hidden'}`
            : `${tool.label} map ${enabled ? 'on' : 'off'}`,
        )
        return
      }
      if (tool.mode === 'instant') {
        setSandboxStatus(`${tool.label}...`)
        let handled = true
        if (tool.time) {
          const result =
            tool.time.control === 'pause'
              ? pauseSim()
              : tool.time.control === 'resume'
                ? resume()
                : tool.time.control === 'speed' && tool.time.mult
                  ? setSpeed(tool.time.mult)
                  : Promise.resolve(false)
          void result.then((ok) =>
            setTemporarySandboxStatus(ok ? `${tool.label} applied` : `${tool.label} failed`),
          )
        } else if (tool.fire) {
          void sendCommand(tool.fire).then((ok) =>
            setTemporarySandboxStatus(ok ? `${tool.label} applied` : `${tool.label} failed`),
          )
        } else {
          handled = false
        }
        if (!handled) setTemporarySandboxStatus(null)
        return
      }
      setArmedTool((prev) => {
        const next = prev?.id === tool.id ? null : tool
        if (sandboxStatusTimer.current !== null) {
          window.clearTimeout(sandboxStatusTimer.current)
          sandboxStatusTimer.current = null
        }
        setSandboxStatus(next ? `${tool.label} armed - click the world to apply` : null)
        return next
      })
    },
    [pauseSim, resume, setSpeed, sendCommand, setTemporarySandboxStatus],
  )

  // Answering a prayer: look at the tribe and pick up the power that helps.
  const handleAnswerPrayer = useCallback(
    (prayer: PrayerInfo) => {
      useCameraFocus.getState().focusTile(prayer.x, prayer.y)
      const id = prayerTool(prayer.kind)
      const tool = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === id)
      if (!tool || armedTool?.id === tool.id) return
      onPickTool(tool)
    },
    [armedTool, onPickTool],
  )

  // After the last person dies: seed new people by hand, or start over.
  const handleSeedPeople = useCallback(() => {
    const tool = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === 'spawn5')
    if (tool && armedTool?.id !== tool.id) onPickTool(tool)
    setSandboxStatus('click the land to seed a new tribe')
  }, [armedTool, onPickTool])
  const handleNewWorld = useMemo(
    () =>
      getWorldSource() === 'wasm'
        ? () => {
            void askConfirm({
              title: 'Start a new world?',
              body: 'This silent world is kept in recovery saves.',
              confirmLabel: 'start new',
            }).then((ok) => {
              if (ok) requestOwnWorldReset()
            })
          }
        : null,
    [],
  )

  // Pick up a dock tool by id while looking at a spot (the tribe card).
  const handlePickToolAt = useCallback(
    (toolId: string, at: { x: number; y: number }) => {
      useCameraFocus.getState().focusTile(at.x, at.y)
      const tool = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === toolId)
      if (tool && armedTool?.id !== tool.id) onPickTool(tool)
    },
    [armedTool, onPickTool],
  )

  const handleSandboxApply = useCallback(
    (wx: number, wy: number) => {
      if (!sandboxControlsEnabled || !armedTool?.build) return
      const label = armedTool.label
      const x = Math.round(wx)
      const y = Math.round(wy)
      setSandboxStatus(`${label} -> ${x}, ${y}`)
      const tool = armedTool
      void sendCommand(tool.build!(x, y, brush)).then((ok) => {
        setTemporarySandboxStatus(ok ? `${label} applied at ${x}, ${y}` : `${label} · ${toolFailure(tool)}`)
      })
    },
    [armedTool, brush, sandboxControlsEnabled, sendCommand, setTemporarySandboxStatus],
  )

  const guideLineage = useCallback(
    async (lineage: string, strategy: LineageStrategy) => {
      if (!sandboxControlsEnabled) return false
      const ok = await sendCommand({
        cmd: 'guide',
        lineage,
        strategy,
        duration_ticks: 7200,
      })
      setTemporarySandboxStatus(ok ? `${strategy} guidance set` : 'guidance failed')
      return ok
    },
    [sandboxControlsEnabled, sendCommand, setTemporarySandboxStatus],
  )

  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const overlay = useUIStore((s) => s.overlay)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const palette = viewFlags.colorBlind ? 'colorblind' : 'standard'
  const openDesktopSettings = useUIStore((s) => s.openDesktopSettings)

  useEffect(() => {
    if (window.thbDesktop?.platform === 'darwin') {
      document.body.classList.add('thb-desktop-mac')
      return () => document.body.classList.remove('thb-desktop-mac')
    }
  }, [])

  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    return desk.on('menu:openSettings', () => openDesktopSettings())
  }, [openDesktopSettings])

  useEffect(() => {
    if (!desktop) return
    const applyVisibility = (visibility: 'minimized' | 'hidden' | 'restored') => {
      desktopWindowInactiveRef.current = isDesktopWindowInactive(visibility)
      const paused = shouldPauseDesktopRenderer(desktopPauseWhenHidden, visibility)
      setDesktopRendererPaused(paused)
      document.body.classList.toggle('thb-app-minimized', paused)
    }
    const currentVisibility =
      desktopWindowInactiveRef.current || document.visibilityState === 'hidden' ? 'hidden' : 'restored'
    applyVisibility(currentVisibility)
    const stopListening = desktop.on('app:visibility', applyVisibility)
    return () => {
      stopListening()
      document.body.classList.remove('thb-app-minimized')
    }
  }, [desktop, desktopPauseWhenHidden])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '[' && e.key !== ']') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.closest('input, textarea, select, button, [role="dialog"]') || target.isContentEditable)
      ) {
        return
      }
      const orgs = world?.organisms.filter((o) => o.alive)
      if (!orgs || orgs.length === 0) return
      e.preventDefault()
      const dir = e.key === '[' ? -1 : 1
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

  // Game keys: speeds, the next prayer, the next tribe on the brink.
  const brinkIndex = useRef(0)
  useEffect(() => {
    const onGameKey = (event: KeyboardEvent) => {
      if (!sandboxControlsEnabled || event.repeat || typingTarget(event.target)) return
      const action = shortcutFor(event)
      if (!action) return
      event.preventDefault()
      if (action.kind === 'speed') {
        const tool = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === action.tool)
        if (tool) onPickTool(tool)
      } else if (action.kind === 'prayer') {
        const prayers = world?.prayers ?? []
        const first = prayerRows(prayers, world?.tick ?? 0)[0]
        if (first) handleAnswerPrayer(first.prayer)
        else setTemporarySandboxStatus('no one is praying')
      } else {
        const perils = [...(world?.tribes_in_peril ?? [])].sort((a, b) => a.population - b.population)
        if (!world || perils.length === 0) {
          setTemporarySandboxStatus('no tribe is on the brink')
          return
        }
        const peril = perils[brinkIndex.current++ % perils.length]!
        useUIStore.getState().setFocus(`lineage:${peril.lineage_id}`)
        const home = tribeHome(world, peril.lineage_id)
        if (home) useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y))
      }
    }
    window.addEventListener('keydown', onGameKey)
    return () => window.removeEventListener('keydown', onGameKey)
  }, [onPickTool, sandboxControlsEnabled, world, handleAnswerPrayer, setTemporarySandboxStatus])

  useEffect(() => {
    const togglePlayback = (event: KeyboardEvent) => {
      if (!sandboxControlsEnabled) return
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains('map2d-world')) return
      event.preventDefault()
      onPickTool({
        id: 'keyboard-playback',
        label: runtimeState.paused ? 'play' : 'pause',
        icon: '',
        mode: 'instant',
        time: { control: runtimeState.paused ? 'resume' : 'pause' },
      })
    }
    window.addEventListener('keydown', togglePlayback)
    return () => window.removeEventListener('keydown', togglePlayback)
  }, [onPickTool, runtimeState.paused, sandboxControlsEnabled])

  useEffect(() => {
    const clearTool = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setArmedTool(null)
        setTemporarySandboxStatus(null)
        // Esc also leaves photo mode, which hides every other way out.
        const ui = useUIStore.getState()
        if (ui.viewFlags.photoMode) ui.setViewFlag('photoMode', false)
      }
    }
    window.addEventListener('keydown', clearTool)
    return () => window.removeEventListener('keydown', clearTool)
  }, [setTemporarySandboxStatus])

  useEffect(() => {
    // H toggles immersive mode (hides panels + bottom dock). Matches
    // the observation-mode option in the command palette.
    function onKey(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== 'h' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.closest('input, textarea, select, button, [role="dialog"]') || target.isContentEditable)
      ) {
        return
      }
      const ui = useUIStore.getState()
      ui.setViewFlag('hideUI', !ui.viewFlags.hideUI)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!world) return
    const reconciledSelection = reconcileViewerSelection(selectedOrgId, world)
    if (reconciledSelection !== selectedOrgId) {
      useUIStore.getState().selectOrg(reconciledSelection)
    }
  }, [world, selectedOrgId])

  // Optionally stop the clock when a tribe newly falls on the brink.
  const seenPerils = useRef(new Set<string>())
  const perilSeeded = useRef(false)
  useEffect(() => {
    if (!world) return
    const fresh = newPerils(seenPerils.current, world.tribes_in_peril)
    // The first look only learns who is already in danger: loading a save
    // must not pause for tribes that were on the brink before.
    if (!perilSeeded.current) {
      perilSeeded.current = true
      return
    }
    if (fresh.length > 0 && useUIStore.getState().pauseOnPeril) {
      pauseSim()
      const names = fresh.map((p) => p.tribe).join(', ')
      setTemporarySandboxStatus(`paused: ${names} on the brink`)
    }
  }, [world, pauseSim, setTemporarySandboxStatus])

  const lastHeadlineTickRef = useRef<number>(0)
  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    if (!world?.headlines || world.headlines.length === 0) return
    const newest = world.headlines[0]
    if (!newest || typeof newest.tick !== 'number') return
    if (newest.tick <= lastHeadlineTickRef.current) return
    lastHeadlineTickRef.current = newest.tick
    if (document.visibilityState !== 'visible' || desktopWindowInactiveRef.current) {
      void desk.app.notify({ title: 'The Human Box', body: newest.text })
    }
  }, [world?.headlines])

  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if ((!world && !localStartupFailed) || splashHiddenRef.current) return
    splashHiddenRef.current = true
    window.dispatchEvent(new Event('thb-world-ready'))
    if (world) {
      trackEvent('world_first_loaded', {
        tick: world.tick,
        alive: world.organisms.filter((o) => o.alive).length,
      })
    }
  }, [localStartupFailed, world])

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

  const orgList = world?.organisms
  const sickOrgs = useMemo(
    () => (orgList ? orgList.filter((o) => o.alive && o.infection > 0.15).length : 0),
    [orgList],
  )

  const liveOrgs = useMemo(() => orgList?.filter((o) => o.alive) ?? [], [orgList])
  const deadOrgs = useMemo(() => orgList?.filter((o) => !o.alive) ?? [], [orgList])

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
    <SimulationDataProvider value={simulationData}>
      <div className="app">
        <AppHeader
          world={world ?? null}
          connected={connected}
          sickOrgs={sickOrgs}
          onAnswerPrayer={handleAnswerPrayer}
        />
        <HeadlineTicker world={world ?? null} enabled={viewFlags.headlineTicker} />

        <DesktopDownloadToast />
        <CommandPalette />
        <PhotoModeExit />
        <ConfirmHost />
        <WorldSilent world={world ?? null} onSeed={handleSeedPeople} onNewWorld={handleNewWorld} />

        <main className="main" data-tour="world-canvas">
          {world ? (
            <div className="layout">
              {leftOpen && <div className="panel-overlay panel-overlay-left" onClick={toggleLeft} />}
              <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
                {leftOpen && (
                  // Keyed by palette: these bake lineage colours in at
                  // render, so the colourblind toggle remounts them.
                  <Fragment key={palette}>
                    <HistoryGrid />
                    <LineagesList />
                    <EventLog />
                    <WorldFooter world={world} />
                  </Fragment>
                )}
              </aside>

              {currentScene ? (
                <Suspense fallback={null}>
                  <SceneView world={world} />
                </Suspense>
              ) : (
                <WorldView
                  world={world}
                  interp={interp}
                  rendererPaused={desktopRendererPaused}
                  sandboxArmed={sandboxControlsEnabled && !!armedTool}
                  sandboxLabel={armedTool?.label}
                  sandboxToolId={armedTool?.id}
                  sandboxRadius={(() => {
                    const preview = armedTool?.build?.(0, 0, brush)
                    return preview && 'radius' in preview ? (preview.radius ?? 0) : 0
                  })()}
                  onSandboxApply={handleSandboxApply}
                  onPrayerClick={handleAnswerPrayer}
                />
              )}

              {!currentScene && !viewFlags.hideUI && (
                <TribeCard
                  world={world}
                  onAnswer={handleAnswerPrayer}
                  onTool={handlePickToolAt}
                  onRename={(lineage, name) => void sendCommand({ cmd: 'rename_tribe', lineage, name })}
                  onTeach={(lineage) =>
                    void sendCommand({ cmd: 'teach', lineage }).then((ok) =>
                      setTemporarySandboxStatus(
                        ok ? 'the gods taught them a secret' : 'they cannot be taught again yet',
                      ),
                    )
                  }
                />
              )}

              <RightPanel
                key={palette}
                world={world}
                liveOrgs={liveOrgs}
                deadOrgs={deadOrgs}
                selectedOrg={selectedOrg}
              />
            </div>
          ) : (
            <div className="waiting">
              {!localStartupFailed && <div className="waiting-spinner" aria-hidden="true" />}
              <div className="waiting-title">
                {localStartupFailed ? 'local world could not start' : 'starting your world…'}
              </div>
              <div className="waiting-sub">
                {localStartupFailed
                  ? localSaveStatus.message
                  : desktop
                    ? 'starting the native simulation on this computer'
                    : 'loading the private WebAssembly simulation saved in this browser'}
              </div>
              {localStartupFailed && (
                <button className="lang-btn" onClick={() => reloadAppSafely()}>
                  retry local world
                </button>
              )}
            </div>
          )}
        </main>

        {world && sandboxControlsEnabled && !viewFlags.hideUI && (
          <SandboxToolbar
            armedToolId={armedTool?.id ?? null}
            armedToolLabel={armedTool?.label ?? null}
            brush={brush}
            status={sandboxStatus}
            runtimePaused={runtimeState.paused}
            runtimeSpeed={runtimeState.speed}
            activeOverlay={overlay}
            activeViewFlags={{
              territory: viewFlags.territory,
              history: viewFlags.history,
              names: viewFlags.names,
              thoughts: viewFlags.thoughts,
              animals: viewFlags.animals,
              grid: viewFlags.grid,
            }}
            onBrush={setBrush}
            onPick={onPickTool}
            onClearArmed={() => {
              setArmedTool(null)
              setTemporarySandboxStatus(null)
            }}
            onClearView={() => {
              const ui = useUIStore.getState()
              ui.setOverlay(null)
              ui.setTerritoryView(false)
              ui.setViewFlag('history', false)
              setTemporarySandboxStatus('map layers cleared')
            }}
            onSave={
              isLocalWebWorld || (desktop && desktopMode === 'local')
                ? () => void saveLocalWorld()
                : undefined
            }
            saveBusy={
              localSaveStatus.phase === 'loading' ||
              localSaveStatus.phase === 'retrying' ||
              localSaveStatus.phase === 'saving'
            }
            saveError={localSaveStatus.phase === 'error'}
            saveRetryable={localSaveStatus.phase === 'error' && localSaveStatus.retryable === true}
            saveStatus={
              localSaveStatus.phase === 'loading'
                ? 'loading local save…'
                : localSaveStatus.phase === 'retrying'
                  ? 'retrying local storage…'
                  : localSaveStatus.phase === 'ready'
                    ? localSaveStatus.restored
                      ? `world restored at tick ${localSaveStatus.tick.toLocaleString()}`
                      : 'new local world ready'
                    : localSaveStatus.phase === 'saving'
                      ? `saving tick ${localSaveStatus.tick.toLocaleString()}…`
                      : localSaveStatus.phase === 'saved'
                        ? `saved locally · tick ${localSaveStatus.tick.toLocaleString()}`
                        : localSaveStatus.phase === 'error'
                          ? localSaveStatus.message
                          : undefined
            }
          />
        )}

        {world && (
          <ModalRouter
            world={world}
            lineages={lineages}
            onGuide={sandboxControlsEnabled ? guideLineage : undefined}
          />
        )}

        <MobileBanner />
        {world && <WelcomeModal />}
        <UpdateToast />
        <PrayerHint world={world ?? null} onAnswer={handleAnswerPrayer} />
        <DesktopUpdateToast />
      </div>
    </SimulationDataProvider>
  )
}

export default App
