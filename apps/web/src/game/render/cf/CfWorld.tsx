import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useGame } from 'cubeforge'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import { cfFlag } from './flags'
import { claimCf } from './ownership'
import { makeFrame } from './frame'
import { CfRegistry } from './registry'
import { CfBuildings } from './buildings/CfBuildings'
import { CfVegetation } from './vegetation/CfVegetation'
import { CfLanduse } from './landuse/CfLanduse'

interface Props {
  world: WorldState
  interp?: InterpRefs
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims: { w: number; h: number }
  rendererPaused: boolean
}

/** Which parts of the map the cubeforge layers own, from `?cf=`. */
export function cfPartsEnabled() {
  return {
    buildings: cfFlag('buildings'),
    vegetation: cfFlag('vegetation'),
    landuse: cfFlag('landuse'),
  }
}

/**
 * Mounts the flagged cubeforge layers inside <World> and feeds them the same
 * interpolated world the canvas painter draws. Renders nothing itself.
 */
export function CfWorld({ world, interp, cameraStateRef, viewportDims, rendererPaused }: Props) {
  const engine = useGame()
  const parts = useMemo(cfPartsEnabled, [])
  const registry = useMemo(() => new CfRegistry(), [])
  const worldRef = useRef(world)
  worldRef.current = world
  const cachedBiomes = useRef<number[][] | undefined>(undefined)

  // The canvas painter skips what is claimed here; claiming happens before the
  // first canvas paint (this component is mounted ahead of the world sprite).
  useLayoutEffect(() => {
    const names = Object.entries(parts)
      .filter(([, on]) => on)
      .map(([name]) => name)
    return claimCf(names)
  }, [parts])

  useEffect(() => {
    const handle = { registry, engine }
    ;(window as unknown as { __thbCf?: unknown }).__thbCf = handle
    return () => {
      delete (window as unknown as { __thbCf?: unknown }).__thbCf
    }
  }, [registry, engine])

  useEffect(() => {
    if (rendererPaused) return
    let raf = 0
    let last = -Infinity
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || now - last < 1000 / 30) return
      last = now
      const w = interp?.current.current ?? worldRef.current
      if (!w) return
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]
      const frame = makeFrame(w, cachedBiomes.current, cameraStateRef.current, viewportDims, Date.now(), 2)
      if (registry.update(frame)) engine.loop.markDirty()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine, interp, cameraStateRef, viewportDims, rendererPaused, registry])

  return (
    <>
      {parts.buildings && <CfBuildings registry={registry} />}
      {parts.vegetation && <CfVegetation registry={registry} />}
      {parts.landuse && <CfLanduse registry={registry} />}
    </>
  )
}
