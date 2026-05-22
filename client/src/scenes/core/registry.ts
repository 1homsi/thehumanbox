import type { RenderMode, SceneKind, SceneRegistry, SceneRenderer } from './types'

const registry: SceneRegistry = {}

export function registerScene(kind: SceneKind, mode: RenderMode, renderer: SceneRenderer): void {
  const entry = registry[kind] ?? {}
  entry[mode] = renderer
  registry[kind] = entry
}

export function getSceneRenderer(kind: SceneKind, mode: RenderMode): SceneRenderer | undefined {
  const entry = registry[kind]
  if (!entry) return undefined
  return entry[mode] ?? entry['2d'] ?? entry['3d']
}

export function listRegisteredScenes(): SceneKind[] {
  return Object.keys(registry) as SceneKind[]
}
