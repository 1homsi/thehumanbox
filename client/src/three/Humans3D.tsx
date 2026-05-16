import { useMemo, useRef } from 'react'
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

// Render more orgs as full animated robots (was 15). 40 is the
// sweet spot on a mid GPU - draw calls + mixer cost stay under
// ~5 ms/frame even with dance/walk animation playing.
const MAX_ANIMATED   = 40
const NEAR_RADIUS_SQ = 140 * 140

// Movement detection: keep the previous tick's positions per org id
// in a module-level map so we can compute a velocity and switch
// between Idle / Walking. Cleared automatically as orgs come and go
// (we only read; stale entries are harmless).
const prevPositions = new Map<string, { x: number; y: number }>()

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
  const { scene, animations } = useGLTF('/models/robot-expressive.glb')
  const tickRef = useRef(0)

  // Pick N closest alive orgs. Each gets an animated robot.
  // Velocity is the per-tick delta from the previous WS snapshot.
  const near = useMemo(() => {
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: { org: OrganismState; d: number; vmag: number }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      const dx = o.x * TILE_SCALE - cx
      const dz = o.y * TILE_SCALE - cz
      const d  = dx * dx + dz * dz
      if (d > NEAR_RADIUS_SQ) continue
      // velocity magnitude in tile units / tick.
      const prev = prevPositions.get(o.id)
      const vmag = prev ? Math.hypot(o.x - prev.x, o.y - prev.y) : 0
      scored.push({ org: o, d, vmag })
    }
    scored.sort((a, b) => a.d - b.d)
    const top = scored.slice(0, MAX_ANIMATED)
    // Update prev for ALL alive orgs (not just near) so when they
    // come into range we have a baseline.
    tickRef.current++
    if (tickRef.current % 1 === 0) {
      for (const o of organisms) {
        if (o.alive) prevPositions.set(o.id, { x: o.x, y: o.y })
      }
    }
    return top
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  if (!depthMap || !biomes) return null

  return (
    <>
      {near.map(({ org: o, vmag }) => {
        const groundY = heightAt(o.x, o.y, depthMap, biomes)
        const moving = vmag > 0.05
        return (
          <AnimatedFigure
            key={o.id}
            scene={scene}
            animations={animations}
            position={[o.x * TILE_SCALE, groundY, o.y * TILE_SCALE]}
            scale={0.45}
            animation={pickAnim(o, moving)}
            color={lineageColor(o.lineage_id)}
          />
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
