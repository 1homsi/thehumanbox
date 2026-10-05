import { useEffect, useRef } from 'react'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import { interpolationFactor } from '../render-timing'

/** What a sprite layer needs to know about "now": the frame, the one before, and how far between them. */
export interface SpriteFrame {
  world: WorldState
  /** The previous frame to walk from, or null when the world is not interpolating. */
  prev: WorldState | null
  /** 0 at the previous frame, 1 at this one. Never extrapolates. */
  t: number
  /** Wall-clock milliseconds, the same clock the canvas painter animates by. */
  now: number
}

export function readSpriteFrame(
  interp: InterpRefs | undefined,
  fallback: WorldState | null,
  rafNow: number,
  wallNow: number,
): SpriteFrame | null {
  const cur = interp?.current.current ?? null
  const world = cur ?? fallback
  if (!world) return null
  const prev = interp?.prev.current ?? null
  if (!interp || !prev || cur !== world) return { world, prev: null, t: 1, now: wallNow }
  const interval = Math.max(50, interp.currentServerAt.current - interp.prevServerAt.current)
  return {
    world,
    prev,
    t: interpolationFactor(rafNow, interp.currentReceivedAt.current, interval),
    now: wallNow,
  }
}

/**
 * Calls `onFrame` once per display frame while mounted and not paused. Unlike
 * the canvas painter's loop this one is not throttled to 30 fps: it only writes
 * typed arrays, so it can follow the display.
 */
export function useSpriteClock(
  interp: InterpRefs | undefined,
  world: WorldState,
  paused: boolean,
  onFrame: (frame: SpriteFrame) => void,
): void {
  const worldRef = useRef(world)
  worldRef.current = world
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  useEffect(() => {
    if (paused) return
    let raf = 0
    const tick = (rafNow: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const frame = readSpriteFrame(interp, worldRef.current, rafNow, Date.now())
      if (frame) onFrameRef.current(frame)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [interp, paused])
}
