import { create } from 'zustand'

/**
 * A one-shot request for the world camera, which the map clears once queued: centre on a tile (at least `zoom`
 * close, 2 when not given), or pull back to the whole world.
 */
export type CameraFocusRequest =
  { kind?: 'tile'; x: number; y: number; zoom?: number; n: number } | { kind: 'fit'; n: number }

interface CameraFocusState {
  request: CameraFocusRequest | null
  focusTile: (x: number, y: number, zoom?: number) => void
  fitWorld: () => void
}

export const useCameraFocus = create<CameraFocusState>()((set) => ({
  request: null,
  focusTile: (x, y, zoom) =>
    set((s) => ({ request: { kind: 'tile', x, y, zoom, n: (s.request?.n ?? 0) + 1 } })),
  fitWorld: () => set((s) => ({ request: { kind: 'fit', n: (s.request?.n ?? 0) + 1 } })),
}))
