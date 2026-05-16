import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Only animate the N closest orgs. Animated SkinnedMesh + AnimationMixer
// is ~0.5ms each per frame; with 300 alive orgs we'd burn the budget.
// 15 lets you fly close to a tribe and still see motion without lag.
const MAX_ANIMATED   = 15
const NEAR_RADIUS_SQ = 80 * 80

// Map an org's current thought to a robot animation. Robot Expressive
// has Idle, Walking, Running, Sitting, Death, Dance, Wave, etc.
function thoughtToAnim(o: OrganismState): string {
  if (!o.alive) return 'Death'
  const t = (o.thought || '').toLowerCase()
  if (t.includes('rest') || t.includes('sleep') || t.includes('sitting')) return 'Sitting'
  if (t.includes('dance') || t.includes('celebration'))                    return 'Dance'
  if (t.includes('flee')  || t.includes('run') || t.includes('chase'))     return 'Running'
  if (t.includes('greet') || t.includes('wave'))                           return 'Wave'
  return 'Walking'
}

export function Humans3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const { scene, animations } = useGLTF('/models/robot-expressive.glb')

  // Pick the N closest alive orgs to the camera. Re-eval each parent
  // render (~10 Hz with WS ticks); cheap on a few hundred orgs.
  const near = useMemo(() => {
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: { org: OrganismState; d: number }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      const dx = o.x * TILE_SCALE - cx
      const dz = o.y * TILE_SCALE - cz
      const d  = dx * dx + dz * dz
      if (d <= NEAR_RADIUS_SQ) scored.push({ org: o, d })
    }
    scored.sort((a, b) => a.d - b.d)
    return scored.slice(0, MAX_ANIMATED).map(s => s.org)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  if (!depthMap || !biomes) return null

  return (
    <>
      {near.map(o => {
        const groundY = heightAt(o.x, o.y, depthMap, biomes)
        return (
          <AnimatedFigure
            key={o.id}
            scene={scene}
            animations={animations}
            position={[o.x * TILE_SCALE, groundY, o.y * TILE_SCALE]}
            scale={0.35}
            animation={thoughtToAnim(o)}
            color={lineageColor(o.lineage_id)}
          />
        )
      })}
    </>
  )
}

// Tell drei's loader to preload the model so the first frame after
// the 3D toggle doesn't pause for the network round-trip.
useGLTF.preload('/models/robot-expressive.glb')

// Returns the set of org IDs being rendered as full robots, so the
// capsule layer can skip them and we don't double-render.
export function nearAnimatedIds(
  organisms: OrganismState[],
  cameraX: number,
  cameraZ: number,
): Set<string> {
  const scored: { id: string; d: number }[] = []
  for (const o of organisms) {
    if (!o.alive) continue
    const dx = o.x * TILE_SCALE - cameraX
    const dz = o.y * TILE_SCALE - cameraZ
    const d  = dx * dx + dz * dz
    if (d <= NEAR_RADIUS_SQ) scored.push({ id: o.id, d })
  }
  scored.sort((a, b) => a.d - b.d)
  return new Set(scored.slice(0, MAX_ANIMATED).map(s => s.id))
}
