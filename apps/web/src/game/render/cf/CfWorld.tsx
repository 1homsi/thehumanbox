import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGame } from 'cubeforge'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import { logger } from '../../../shared/logger'
import { vegetationSeason } from '../landscape-style'
import { isSettled } from '../render-timing'
import { terrainSeason } from '../terrain-season'
import { TerrainTileLayer, type TerrainSyncFn } from '../terrain-tiles/TerrainTileLayer'
import { makeFrame } from './frame'
import { CfRegistry } from './registry'
import { wakeEngine } from './frame-clock'
import { SleepyLoop } from './render-loop'
import { CfBuildings } from './buildings/CfBuildings'
import { CfGround } from './ground/CfGround'
import { CfLanduse } from './landuse/CfLanduse'
import { CfRoads } from './roads/CfRoads'
import { CfVegetation } from './vegetation/CfVegetation'
import { TerrainWatch } from './vegetation/terrain-watch'

interface Props {
  world: WorldState
  interp?: InterpRefs
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims: { w: number; h: number }
  rendererPaused: boolean
  /** The first frame of the world has been handed to the engine. */
  onFirstDraw: () => void
  onDrawError: (message: string) => void
}

/**
 * The static world on cubeforge: the terrain TileLayer and the SpriteLayers for ground detail,
 * vegetation, land use, huts and buildings. One loop (30 Hz, like the simulation's frames)
 * feeds them the current world; they rewrite only what changed. Renders nothing itself.
 */
export function CfWorld({
  world,
  interp,
  cameraStateRef,
  viewportDims,
  rendererPaused,
  onFirstDraw,
  onDrawError,
}: Props) {
  const engine = useGame()
  const registry = useMemo(() => new CfRegistry(), [])
  const watch = useMemo(() => new TerrainWatch(), [])
  const terrainSyncRef = useRef<TerrainSyncFn | null>(null)
  const worldRef = useRef(world)
  worldRef.current = world
  const cachedBiomes = useRef<number[][] | undefined>(undefined)
  const cachedDepth = useRef<number[][] | undefined>(undefined)
  const hasDrawn = useRef(false)
  const onFirstDrawRef = useRef(onFirstDraw)
  onFirstDrawRef.current = onFirstDraw
  const onDrawErrorRef = useRef(onDrawError)
  onDrawErrorRef.current = onDrawError

  const gw = world.grid.width
  const gh = world.grid.height

  const step = useCallback(
    (w: WorldState) => {
      // Wire grids are delta-merged: biomes and depth only arrive with full frames.
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]
      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      const grid = w.grid
      const camera = cameraStateRef.current
      // The cover over the map comes off after the first pass, even before the terrain has arrived:
      // an empty map is ocean blue, as the cover is.
      const signalFirstDraw = () => {
        if (hasDrawn.current) return
        hasDrawn.current = true
        wakeEngine(engine, 30)
        requestAnimationFrame(() => requestAnimationFrame(() => onFirstDrawRef.current()))
      }
      if (!grid.tiles || grid.tiles.length < grid.height) {
        signalFirstDraw()
        return
      }
      terrainSyncRef.current?.({
        width: grid.width,
        height: grid.height,
        tiles: grid.tiles,
        biomes: cachedBiomes.current,
        depth_map: cachedDepth.current,
        season: terrainSeason(w),
        zoom: camera.zoom,
      })
      watch.update(
        grid.tiles,
        cachedBiomes.current,
        grid.width,
        grid.height,
        grid.origin_x ?? 0,
        grid.origin_y ?? 0,
        vegetationSeason(terrainSeason(w)),
      )
      const frame = makeFrame(w, cachedBiomes.current, camera, viewportDims, Date.now(), 2, watch.revision)
      if (registry.update(frame)) wakeEngine(engine, 30)
      signalFirstDraw()
    },
    [engine, cameraStateRef, viewportDims, registry, watch],
  )

  // Paint the current world right away (before the first rAF) so the map is not empty when it appears.
  useEffect(() => {
    const w = interp?.current.current ?? worldRef.current
    if (!w) return
    try {
      step(w)
    } catch (error) {
      logger.error('2d-world', 'GPU world drawing failed', error)
      onDrawErrorRef.current('The world could not be drawn. Retry the renderer to restore the map.')
    }
  }, [interp, step])

  useEffect(() => {
    if (rendererPaused) return
    let last = -Infinity
    let lastKey = ''
    const loop = new SleepyLoop((now) => {
      if (document.hidden || now - last < 1000 / 30) return true
      last = now
      const w = interp?.current.current ?? worldRef.current
      if (!w) return true
      // A paused map with a still camera stays as it is (fires stop flickering, trees stop swaying):
      // the loop sleeps, and a new frame, a pan or a zoom wakes it.
      const cam = cameraStateRef.current
      const key = `${interp?.currentServerAt.current ?? 0}|${cam.x}|${cam.y}|${cam.zoom}|${viewportDims.w}x${viewportDims.h}`
      if (interp && key === lastKey && isSettled(interp, now)) return false
      lastKey = key
      try {
        step(w)
      } catch (error) {
        logger.error('2d-world', 'GPU world drawing failed', error)
        onDrawErrorRef.current('The world could not be drawn. Retry the renderer to restore the map.')
        return false
      }
      return true
    })
    loop.wake()
    return () => loop.stop()
  }, [interp, rendererPaused, step, cameraStateRef, viewportDims])

  useEffect(() => {
    const handle = { registry, engine }
    ;(window as unknown as { __thbCf?: unknown }).__thbCf = handle
    return () => {
      delete (window as unknown as { __thbCf?: unknown }).__thbCf
    }
  }, [registry, engine])

  return (
    <>
      <TerrainTileLayer width={gw} height={gh} syncRef={terrainSyncRef} />
      <CfVegetation registry={registry} />
      <CfRoads registry={registry} />
      <CfGround registry={registry} />
      <CfLanduse registry={registry} />
      <CfBuildings registry={registry} />
    </>
  )
}
