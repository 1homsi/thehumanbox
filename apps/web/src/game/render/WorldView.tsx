import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Game, World, Camera2D } from 'cubeforge'
import type { PrayerInfo, WorldState } from '../../shared/types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore } from '../../state/store'
import { useCameraFocus } from '../../state/camera-focus'
import { buildTerritoryIndex } from '../model/territory'
import { TILE } from '../model/palette'
import { CanvasCameraController } from './CanvasCameraController'
import { World2DErrorBoundary } from './World2DErrorBoundary'
import { WorldMapHud } from './WorldMapHud'
import { WorldMinimap } from './minimap/WorldMinimap'
import { HoverOutline } from './hover/HoverOutline'
import { TerritoryHoverCard } from './hover/TerritoryHoverCard'
import { installBenchHooks } from './bench-hooks'
import { SandboxBursts } from './SandboxBursts'
import { useSandboxBursts } from './sandbox-bursts'
import type { MapCommand } from './camera-controls'
import { CanvasWorldFallback } from './world-view/CanvasWorldFallback'
import { useRendererBackend } from './world-view/useRendererBackend'
import { useMapPointer } from './world-view/useMapPointer'
import { CfWorld } from './cf/CfWorld'
import { CfMapCameraController } from './cf/input/CfMapCameraController'
import { CfOverlays } from './cf/overlays/CfOverlays'
import { AnimalSpriteLayers } from './cf/animals/AnimalSpriteLayers'
import { PeopleSpriteLayers } from './cf/people/PeopleSpriteLayers'

interface Props {
  world: WorldState
  interp?: InterpRefs
  rendererPaused?: boolean
  sandboxArmed?: boolean
  sandboxLabel?: string | null
  /** Armed tool id, used to pick the effect that plays where it lands. */
  sandboxToolId?: string | null
  sandboxRadius?: number
  onSandboxApply?: (worldX: number, worldY: number) => void
  /** A prayer bubble on the map was clicked. */
  onPrayerClick?: (prayer: PrayerInfo) => void
}

export function WorldView({
  world,
  interp,
  rendererPaused = false,
  sandboxArmed,
  sandboxLabel,
  sandboxToolId,
  sandboxRadius,
  onSandboxApply,
  onPrayerClick,
}: Props) {
  const { bursts, spawn: spawnBurst } = useSandboxBursts()
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const followOrgId = useUIStore((s) => s.followOrgId)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const onOrgSelect = useUIStore((s) => s.selectOrg)
  // Dev builds only: the console and the browser checks read and steer the UI through this.
  const latestWorld = useRef(world)
  latestWorld.current = world
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { __thbDev?: unknown }).__thbDev = {
        ui: useUIStore,
        focus: useCameraFocus,
        world: () => latestWorld.current,
      }
  }, [])
  const territoryIndex = useMemo(() => buildTerritoryIndex(world.territory), [world.territory])
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<MapCommand | null>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  // Dev builds only: lets cf-compare.html drive and read the camera.
  if (import.meta.env.DEV) (window as unknown as { __thbCamera?: unknown }).__thbCamera = cameraStateRef
  // `?bench`: the benchmark harness drives the camera through window.__thbBench.
  useEffect(
    () =>
      installBenchHooks({ camera: cameraStateRef, command: commandRef, world: () => latestWorld.current }),
    [],
  )
  // Other panels (the prayer list) ask the camera to look at a tile.
  const focusRequest = useCameraFocus((s) => s.request)
  useEffect(() => {
    if (!focusRequest) return
    commandRef.current = {
      kind: 'focus',
      x: (focusRequest.x - ox + 0.5) * TILE,
      y: (focusRequest.y - oy + 0.5) * TILE,
    }
  }, [focusRequest, ox, oy])
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const {
    mapReady,
    setMapReady,
    renderBackend,
    drawError,
    setDrawError,
    rendererKey,
    setRendererKey,
    handleFirstDraw,
    handleGPUFailure,
    handleGameReady,
  } = useRendererBackend({ rendererPaused, containerRef, dims })

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find((o) => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  const { overPrayer, handlePointerDown, handlePointerMove, handlePointerCancel, handleClick, handleTap } =
    useMapPointer({
      containerRef,
      cameraStateRef,
      dims,
      world,
      ox,
      oy,
      sandboxArmed,
      onSandboxApply,
      sandboxToolId,
      sandboxRadius,
      spawnBurst,
      onPrayerClick,
      viewFlags,
      focus,
      territoryIndex,
      setFocus,
      onOrgSelect,
    })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ w: clientWidth, h: clientHeight })
      }
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="map2d-world"
      tabIndex={0}
      aria-label="Interactive world map"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        cursor: sandboxArmed ? 'crosshair' : overPrayer ? 'pointer' : 'grab',
        position: 'relative',
        // touch-action: none stops the browser from claiming
        // two-finger pinch as page-zoom; the gesture handler
        // gets the events instead.
        touchAction: 'none',
      }}
      // On the GPU path cubeforge's camera reports taps; the 2D fallback reads clicks itself.
      onPointerDown={renderBackend === 'gpu' ? undefined : handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerCancel}
      onClick={renderBackend === 'gpu' ? undefined : handleClick}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#1a4a80',
          zIndex: 10,
          pointerEvents: 'none',
          opacity: mapReady ? 0 : 1,
          transition: 'opacity 280ms ease-out',
        }}
      />
      {dims.w > 0 &&
        dims.h > 0 &&
        (renderBackend === 'gpu' ? (
          <World2DErrorBoundary key={rendererKey} onCrash={handleGPUFailure}>
            <Game
              mode="onDemand"
              gravity={0}
              width={dims.w}
              height={dims.h}
              onReady={handleGameReady}
              style={{ display: 'block' }}
            >
              <World background="#1a4a80">
                <Camera2D />

                <CfWorld
                  world={world}
                  interp={interp}
                  cameraStateRef={cameraStateRef}
                  viewportDims={dims}
                  rendererPaused={rendererPaused}
                  onFirstDraw={handleFirstDraw}
                  onDrawError={setDrawError}
                />
                <AnimalSpriteLayers
                  world={world}
                  interp={interp}
                  viewFlags={viewFlags}
                  rendererPaused={rendererPaused}
                />
                <PeopleSpriteLayers
                  world={world}
                  interp={interp}
                  selectedOrgId={selectedOrgId}
                  focus={focus}
                  viewFlags={viewFlags}
                  rendererPaused={rendererPaused}
                  cameraStateRef={cameraStateRef}
                />
                <CfOverlays
                  world={world}
                  interp={interp}
                  selectedOrgId={selectedOrgId}
                  overlay={overlay}
                  focus={focus}
                  viewFlags={viewFlags}
                  rendererPaused={rendererPaused}
                  cameraStateRef={cameraStateRef}
                  viewportDims={dims}
                />

                <CfMapCameraController
                  commandRef={commandRef}
                  worldW={W}
                  worldH={H}
                  containerW={dims.w}
                  containerH={dims.h}
                  containerEl={containerRef.current}
                  cameraStateRef={cameraStateRef}
                  followTarget={followTarget}
                  onTap={handleTap}
                />
              </World>
            </Game>
          </World2DErrorBoundary>
        ) : (
          <>
            <CanvasWorldFallback
              key={rendererKey}
              world={world}
              interp={interp}
              selectedOrgId={selectedOrgId}
              overlay={overlay}
              focus={focus}
              viewFlags={viewFlags}
              rendererPaused={rendererPaused}
              onFirstDraw={handleFirstDraw}
              onDrawError={setDrawError}
              cameraStateRef={cameraStateRef}
              viewportDims={dims}
            />
            <CanvasCameraController
              commandRef={commandRef}
              worldW={W}
              worldH={H}
              containerW={dims.w}
              containerH={dims.h}
              containerEl={containerRef.current}
              cameraStateRef={cameraStateRef}
              followTarget={followTarget}
            />
          </>
        ))}
      {drawError && (
        <div
          role="alert"
          data-map-ui
          style={{
            position: 'absolute',
            inset: '35% 15%',
            padding: 24,
            background: '#241f19',
            color: '#fff',
            zIndex: 20,
          }}
        >
          <p>{drawError}</p>
          <button
            onClick={() => {
              setDrawError(null)
              setMapReady(false)
              setRendererKey((key) => key + 1)
            }}
          >
            Retry renderer
          </button>
        </div>
      )}
      <SandboxBursts bursts={bursts} width={dims.w} height={dims.h} />
      {mapReady && !viewFlags.hideUI && (
        <WorldMapHud
          world={world}
          cameraRef={cameraStateRef}
          viewport={dims}
          container={containerRef.current}
          toolLabel={sandboxArmed ? sandboxLabel : null}
          toolRadius={sandboxRadius}
        />
      )}
      {mapReady && !viewFlags.hideUI && dims.w > 0 && (
        <WorldMinimap world={world} cameraRef={cameraStateRef} viewport={dims} />
      )}
      {mapReady && !viewFlags.hideUI && (
        <HoverOutline
          world={world}
          cameraRef={cameraStateRef}
          viewport={dims}
          container={containerRef.current}
          enabled={!sandboxArmed}
        />
      )}
      {mapReady && !viewFlags.hideUI && (
        <TerritoryHoverCard
          world={world}
          cameraRef={cameraStateRef}
          viewport={dims}
          container={containerRef.current}
          enabled={!sandboxArmed}
          territoryIndex={territoryIndex}
        />
      )}
    </div>
  )
}
