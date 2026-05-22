import { useMemo } from 'react'
import type { WorldState } from '../../types'
import { useSceneStore, useCurrentScene } from '../../stores/scene'
import { useUIStore } from '../../stores/store'
import { getSceneRenderer } from '../core/registry'
import '../kinds/home'

interface Props {
  world: WorldState
}

export function SceneView({ world }: Props) {
  const scene  = useCurrentScene()
  const exit   = useSceneStore((s) => s.exit)
  const select = useUIStore((s) => s.selectOrg)

  const resolved = useMemo(() => {
    if (!scene) return null
    const r = getSceneRenderer(scene.kind)
    if (!r) return null
    const ctx = r.resolve(world, scene)
    if (!ctx) return null
    return { renderer: r, ctx }
  }, [scene, world])

  if (!scene || !resolved) return null

  const { renderer, ctx } = resolved
  const Renderer = renderer.Render
  return (
    <Renderer
      ctx={ctx}
      onExit={exit}
      onFocusOrg={(id) => select(id)}
    />
  )
}
