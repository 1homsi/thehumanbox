import { useMemo } from 'react'
import type { WorldState } from '../../types'
import { useSceneStore, useCurrentScene } from '../../stores/scene'
import { useUIStore, useViewFlag } from '../../stores/store'
import { getSceneRenderer } from '../core/registry'
import '../../2d/scenes/home'
import '../../2d/scenes/tavern'
import '../../2d/scenes/temple'
import '../../2d/scenes/forge'
import '../../2d/scenes/settlement'
import '../../3d/scenes/home'
import '../../3d/scenes/tavern'
import '../../3d/scenes/temple'

interface Props {
  world: WorldState
}

export function SceneView({ world }: Props) {
  const scene = useCurrentScene()
  const exit = useSceneStore((s) => s.exit)
  const select = useUIStore((s) => s.selectOrg)
  const threeD = useViewFlag('threeD')
  const mode = threeD ? '3d' : '2d'

  const resolved = useMemo(() => {
    if (!scene) return null
    const r = getSceneRenderer(scene.kind, mode)
    if (!r) return null
    const ctx = r.resolve(world, scene)
    if (!ctx) return null
    return { renderer: r, ctx }
  }, [scene, world, mode])

  if (!scene || !resolved) return null

  const { renderer, ctx } = resolved
  const Renderer = renderer.Render
  return <Renderer ctx={ctx} onExit={exit} onFocusOrg={(id) => select(id)} />
}
