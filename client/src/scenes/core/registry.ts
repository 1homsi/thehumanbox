import type { SceneKind, SceneRegistry, SceneRenderer } from './types'

const registry: SceneRegistry = {}

export function registerScene(kind: SceneKind, renderer: SceneRenderer): void {
  registry[kind] = renderer
}

export function getSceneRenderer(kind: SceneKind): SceneRenderer | undefined {
  return registry[kind]
}

export function listRegisteredScenes(): SceneKind[] {
  return Object.keys(registry) as SceneKind[]
}
