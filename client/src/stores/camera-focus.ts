import { create } from 'zustand'

/** A one-shot request for the world camera to centre on a tile. */
interface CameraFocusState {
  request: { x: number; y: number; n: number } | null
  focusTile: (x: number, y: number) => void
}

export const useCameraFocus = create<CameraFocusState>()((set) => ({
  request: null,
  focusTile: (x, y) => set((s) => ({ request: { x, y, n: (s.request?.n ?? 0) + 1 } })),
}))
