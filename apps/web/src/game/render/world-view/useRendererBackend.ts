import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameControls } from 'cubeforge'
import { syncRendererLoopPause } from '../../../shared/desktopVisibility'
import { canUseWorldGPU } from './gpu'

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
    // Cubeforge reports some WebGL setup failures inside Game instead of
    // throwing. Its error UI sits behind the startup cover, so recover if a
    // first frame never arrives.
    const timeout = window.setTimeout(handleGPUFailure, 10_000)
    return () => window.clearTimeout(timeout)
  }, [renderBackend, mapReady, dims.w, dims.h, handleGPUFailure])

  useEffect(() => {
    const container = containerRef.current
    if (renderBackend !== 'gpu' || !container) return
    const lost = () => handleGPUFailure()
    container.addEventListener('webglcontextlost', lost, true)
    return () => container.removeEventListener('webglcontextlost', lost, true)
  }, [renderBackend, handleGPUFailure, containerRef])

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
