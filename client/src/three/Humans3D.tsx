import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { useUIStore } from '../store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getOrgXY, getOrgVelocityXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Render more orgs as full animated robots (was 15). 40 is the
// sweet spot on a mid GPU - draw calls + mixer cost stay under
// ~5 ms/frame even with dance/walk animation playing.
const MAX_ANIMATED   = 40
const NEAR_RADIUS_SQ = 140 * 140

// Map an org's current behaviour state to a robot animation.
// Robot Expressive clip names:
//   Idle, Walking, Running, Sitting, Death, Dance, ThumbsUp, Wave,
//   Yes, No, Punch, Standing, WalkJump.
function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'
  const t = (o.thought || '').toLowerCase()
  if (t.includes('rest') || t.includes('sleep') || t.includes('sitting')) return 'Sitting'
  if (t.includes('dance'))                                                return 'Dance'
  if (t.includes('flee') || t.includes('chase') || t.includes('hunt'))    return 'Running'
  if (t.includes('greet') || t.includes('wave'))                          return 'Wave'
  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'
  // Default: walk if actually moving, otherwise idle.
  return isMoving ? 'Walking' : 'Idle'
}

export function Humans3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const selectOrg = useUIStore(s => s.selectOrg)
  const { scene, animations } = useGLTF('/models/robot-expressive.glb')

  const near = useMemo(() => {
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: { org: OrganismState; d: number }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      const dx = o.x * TILE_SCALE - cx
      const dz = o.y * TILE_SCALE - cz
      const d  = dx * dx + dz * dz
      if (d > NEAR_RADIUS_SQ) continue
      scored.push({ org: o, d })
    }
    scored.sort((a, b) => a.d - b.d)
    return scored.slice(0, MAX_ANIMATED).map(s => s.org)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  if (!depthMap || !biomes) return null

  return (
    <>
      {near.map(o => {
        const [vx, vy] = getOrgVelocityXY(o.id)
        const moving = Math.hypot(vx, vy) > 0.05
        return (
          <group
            key={o.id}
            onClick={(e) => {
              e.stopPropagation()
              selectOrg(o.id)
            }}
          >
            <AnimatedFigure
              scene={scene}
              animations={animations}
              getPosition={() => {
                const [x, y] = getOrgXY(o.id)
                const groundY = heightAt(x, y, depthMap, biomes)
                return [x * TILE_SCALE, groundY, y * TILE_SCALE]
              }}
              scale={0.45}
              animation={pickAnim(o, moving)}
              color={lineageColor(o.lineage_id)}
            />
          </group>
        )
      })}
    </>
  )
}

useGLTF.preload('/models/robot-expressive.glb')

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
