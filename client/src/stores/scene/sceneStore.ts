import { create } from 'zustand'
import type { SceneId } from '../../scenes/types'

interface SceneState {
  current: SceneId | null
  enter:   (scene: SceneId) => void
  exit:    () => void
}

export const useSceneStore = create<SceneState>((set) => ({
  current: null,
  enter:   (scene) => set({ current: scene }),
  exit:    () => set({ current: null }),
}))

export function useCurrentScene(): SceneId | null {
  return useSceneStore((s) => s.current)
}
