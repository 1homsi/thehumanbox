import { create } from 'zustand'
import type { SkyOverlayKind } from '../../simulation/sandbox'

export type { SkyOverlayKind }

/** How long each effect stays over the map, in real milliseconds (the sim keeps running under it). */
export const SKY_OVERLAY_MS: Record<SkyOverlayKind, number> = {
  eclipse: 14000,
  aurora: 18000,
}

const FADE_IN_MS = 1500
const FADE_OUT_MS = 3000

/**
 * How strong an overlay is `elapsed` ms after it began: it fades in, holds, then fades out.
 * Zero before it begins and once it has run its course.
 */
export function skyOverlayStrength(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed >= duration) return 0
  if (elapsed < FADE_IN_MS) return elapsed / FADE_IN_MS
  if (elapsed > duration - FADE_OUT_MS) return (duration - elapsed) / FADE_OUT_MS
  return 1
}

interface SkyOverlayState {
  kind: SkyOverlayKind | null
  startedAt: number
  start: (kind: SkyOverlayKind, now?: number) => void
  clear: () => void
}

export const useSkyOverlay = create<SkyOverlayState>()((set) => ({
  kind: null,
  startedAt: 0,
  start: (kind, now = Date.now()) => set({ kind, startedAt: now }),
  clear: () => set({ kind: null }),
}))
