import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Game, World, Entity, Camera2D } from 'cubeforge'
import type { PrayerInfo, WorldState } from '../../shared/types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore } from '../../state/store'
import { useCameraFocus } from '../../state/camera-focus'
import { buildTerritoryIndex } from '../model/territory'
import { TILE } from '../model/palette'
import { MapCameraController } from './MapCameraController'
import { CanvasCameraController } from './CanvasCameraController'
import { World2DErrorBoundary } from './World2DErrorBoundary'
import { WorldMapHud } from './WorldMapHud'
import { SandboxBursts } from './SandboxBursts'
import { useSandboxBursts } from './sandbox-bursts'
import type { MapCommand } from './camera-controls'
import { WorldSprite } from './world-view/WorldSprite'
import { CanvasWorldFallback } from './world-view/CanvasWorldFallback'
import { useRendererBackend } from './world-view/useRendererBackend'
import { useMapPointer } from './world-view/useMapPointer'
import { anyCfOverlay, readCfFeatures } from './cf/overlays/features'
import { cfFlag } from './cf/flags'
import { lazyWithRetry } from '../../shared/lazyWithRetry'

// Only fetched when ?cf=camera asks for it: the default map does not carry the code.
const CfMapCameraController = lazyWithRetry(() =>
  import('./cf/input/CfMapCameraController').then((m) => ({ default: m.CfMapCameraController })),
)

// The cubeforge overlay renderer is opt-in (`?cf=...`), so it stays out of the default chunk.
const CfOverlays = lazy(() => import('./cf/overlays/CfOverlays').then((m) => ({ default: m.CfOverlays })))

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
  const territoryIndex = useMemo(() => buildTerritoryIndex(world.territory), [world.territory])
  const cfFeatures = useMemo(readCfFeatures, [])
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<MapCommand | null>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
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

  // Experimental: cubeforge's pan/zoom and tap instead of the map's own (?cf=camera).
  const cfCamera = useMemo(() => cfFlag('camera'), [])
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
      onPointerDown={cfCamera ? undefined : handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerCancel}
      onClick={cfCamera ? undefined : handleClick}
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
                <Camera2D pixelSnap={cfFlag('snap')} />

                <Entity>
                  <WorldSprite
                    world={world}
                    interp={interp}
                    selectedOrgId={selectedOrgId}
                    overlay={overlay}
                    focus={focus}
                    viewFlags={viewFlags}
                    rendererPaused={rendererPaused}
                    onFirstDraw={handleFirstDraw}
                    onDrawError={setDrawError}
                    atX={cx}
                    atY={cy}
                    cameraStateRef={cameraStateRef}
                    viewportDims={dims}
                  />
                </Entity>

                {anyCfOverlay(cfFeatures) && (
                  <Suspense fallback={null}>
                    <CfOverlays
                      world={world}
                      interp={interp}
                      overlay={overlay}
                      focus={focus}
                      viewFlags={viewFlags}
                      features={cfFeatures}
                      rendererPaused={rendererPaused}
                      cameraStateRef={cameraStateRef}
                      viewportDims={dims}
                    />
                  </Suspense>
                )}

                {cfCamera ? (
                  <Suspense fallback={null}>
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
                  </Suspense>
                ) : (
                  <MapCameraController
                    commandRef={commandRef}
                    worldW={W}
                    worldH={H}
                    containerW={dims.w}
                    containerH={dims.h}
                    containerEl={containerRef.current}
                    cameraStateRef={cameraStateRef}
                    followTarget={followTarget}
                  />
                )}
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
    </div>
  )
}
