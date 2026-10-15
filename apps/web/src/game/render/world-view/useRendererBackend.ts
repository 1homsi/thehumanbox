import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameControls } from 'xipjs'
import { syncRendererLoopPause } from '../../../shared/desktopVisibility'
import { canUseWorldGPU } from './gpu'
import { watchForGpuStartupFailure } from './gpuStartupWatchdog'
import { watchForWebGLContextRecovery } from './webglContextRecovery'
import { wakeRenderLoops } from '../cf/render-loop'

/** Which backend draws the map, whether its first frame has arrived, and recovery from failures. */
export function useRendererBackend({
  rendererPaused,
  containerRef,
  dims,
}: {
  rendererPaused: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  dims: { w: number; h: number }
}) {
  const [mapReady, setMapReady] = useState(false)
  const [renderBackend, setRenderBackend] = useState<'gpu' | 'canvas'>(() =>
    canUseWorldGPU() ? 'gpu' : 'canvas',
  )
  const [drawError, setDrawError] = useState<string | null>(null)
  const [rendererKey, setRendererKey] = useState(0)
  // Stable identity: WorldSprite's frame-loop effect depends on this
  // callback - an inline arrow restarted that loop on every publish.
  const handleFirstDraw = useCallback(() => setMapReady(true), [])
  const gameControlsRef = useRef<GameControls | null>(null)
  const startupWatchdogRef = useRef<ReturnType<typeof watchForGpuStartupFailure> | null>(null)
  const contextRecoveryRef = useRef<ReturnType<typeof watchForWebGLContextRecovery> | null>(null)
  const handleGPUFailure = useCallback(() => {
    gameControlsRef.current = null
    setMapReady(false)
    setRenderBackend('canvas')
  }, [])
  const rendererPausedRef = useRef(rendererPaused)
  rendererPausedRef.current = rendererPaused

  const handleGameReady = useCallback((controls: GameControls) => {
    gameControlsRef.current = controls
    syncRendererLoopPause(controls, rendererPausedRef.current)
  }, [])

  useEffect(() => {
    const controls = gameControlsRef.current
    if (controls) syncRendererLoopPause(controls, rendererPaused)
  }, [rendererPaused])

  useEffect(() => {
    if (renderBackend !== 'gpu' || mapReady || dims.w === 0 || dims.h === 0) return
    // xipjs reports some WebGL setup failures inside Game instead of
    // throwing. Its error UI sits behind the startup cover, so recover if a
    // first frame never arrives. A hidden tab or paused desktop window cannot
    // schedule that frame, so do not count that time against startup.
    const watchdog = watchForGpuStartupFailure(document, rendererPausedRef.current, handleGPUFailure)
    startupWatchdogRef.current = watchdog
    return () => {
      watchdog.dispose()
      startupWatchdogRef.current = null
    }
  }, [renderBackend, mapReady, dims.w, dims.h, handleGPUFailure])

  useEffect(() => {
    startupWatchdogRef.current?.setPaused(rendererPaused)
  }, [rendererPaused])

  useEffect(() => {
    const container = containerRef.current
    if (renderBackend !== 'gpu' || !container) return
    const recovery = watchForWebGLContextRecovery(
      document,
      container,
      rendererPausedRef.current,
      handleGPUFailure,
      wakeRenderLoops,
    )
    contextRecoveryRef.current = recovery
    return () => {
      recovery.dispose()
      contextRecoveryRef.current = null
    }
  }, [renderBackend, handleGPUFailure, containerRef])

  useEffect(() => {
    contextRecoveryRef.current?.setPaused(rendererPaused)
  }, [rendererPaused])

  return {
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
  }
}
