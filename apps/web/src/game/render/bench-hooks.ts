import type { MutableRefObject } from 'react'
import type { MapCamera, MapCommand } from './camera-controls'
import { TILE } from '../model/palette'

/** What the benchmark harness (`apps/web/bench`) may read and steer on the map. */
export interface BenchHooks {
  /** Pixels per tile at zoom 1. */
  tile: number
  camera: () => MapCamera
  /** Hands the camera a request ("fit", "zoom by", "look at"), exactly like the toolbar does. */
  command: (command: MapCommand) => void
  /** Grid size, grid origin, the number of living people and the world tick. */
  info: () => { gridW: number; gridH: number; originX: number; originY: number; people: number; tick: number }
}

interface BenchSource {
  camera: MutableRefObject<MapCamera>
  command: MutableRefObject<MapCommand | null>
  world: () => {
    tick: number
    grid: { width: number; height: number; origin_x?: number; origin_y?: number }
    organisms: readonly { alive?: boolean }[]
  }
}

/** `?bench` in the address of a production build turns the hooks on. */
export function benchHooksEnabled(
  search: string = typeof location === 'undefined' ? '' : location.search,
): boolean {
  return new URLSearchParams(search).has('bench')
}

/**
 * Publishes `window.__thbBench` when `?bench` is set (dev builds always), so a script driving a
 * real browser can place the camera at an exact zoom and read it back. Returns the cleanup.
 */
export function installBenchHooks(source: BenchSource, force = import.meta.env.DEV): () => void {
  if (!force && !benchHooksEnabled()) return () => {}
  const hooks: BenchHooks = {
    tile: TILE,
    camera: () => ({ ...source.camera.current }),
    command: (command) => {
      source.command.current = command
    },
    info: () => {
      const world = source.world()
      return {
        gridW: world.grid.width,
        gridH: world.grid.height,
        originX: world.grid.origin_x ?? 0,
        originY: world.grid.origin_y ?? 0,
        people: world.organisms.filter((o) => o.alive).length,
        tick: world.tick,
      }
    },
  }
  const holder = window as unknown as { __thbBench?: BenchHooks }
  holder.__thbBench = hooks
  return () => {
    if (holder.__thbBench === hooks) delete holder.__thbBench
  }
}
