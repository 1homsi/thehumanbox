import { useEffect, useMemo } from 'react'
import type { WorldState } from '../../../shared/types'
import { useSceneStore, useCurrentScene } from '../../../state/scene'
import { useUIStore } from '../../../state/store'
import { getSceneRenderer } from '../core/registry'
import '../home'
import '../tavern'
import '../temple'
import '../forge'
import '../settlement'

interface Props {
  world: WorldState
}

export function SceneView({ world }: Props) {
  const scene = useCurrentScene()
  const exit = useSceneStore((s) => s.exit)
  const select = useUIStore((s) => s.selectOrg)

  const resolved = useMemo(() => {
    if (!scene) return null
    const r = getSceneRenderer(scene.kind, '2d')
    if (!r) return null
    const ctx = r.resolve(world, scene)
    if (!ctx) return null
    return { renderer: r, ctx }
  }, [scene, world])

  useEffect(() => {
    // A building can fall while its interior is open. Leave the scene as
    // soon as its resolver becomes invalid instead of trapping the player
    // on a blank interior layer.
    if (scene && !resolved) exit()
  }, [scene, resolved, exit])

  if (!scene || !resolved) return null

  const { renderer, ctx } = resolved
  const Renderer = renderer.Render
  return <Renderer ctx={ctx} onExit={exit} onFocusOrg={(id) => select(id)} />
}
