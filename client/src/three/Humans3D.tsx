import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { useUIStore } from '../store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getOrgXY, getOrgVelocityXY, getOrgHeading } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Every alive org renders as a full robot. Capsule LOD has been
// removed - the world reads as "a population of people" instead of
// "some people and some capsules". To keep the cost down at scale,
// only orgs within ANIMATE_RADIUS_SQ run their AnimationMixer; the
// rest render in a static pose (still skinned, still coloured, just
// not bone-updating each frame).
const ANIMATE_RADIUS_SQ = 220 * 220

// Map an org's current behaviour state to a robot animation. Robot
// Expressive clip names: Idle, Walking, Running, Sitting, Death,
// Dance, ThumbsUp, Wave, Yes, No, Punch, Standing, WalkJump.
function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'
  const t = (o.thought || '').toLowerCase()
  if (t.includes('rest') || t.includes('sleep') || t.includes('sitting')) return 'Sitting'
  if (t.includes('dance'))                                                return 'Dance'
  if (t.includes('flee') || t.includes('chase') || t.includes('hunt'))    return 'Running'
  if (t.includes('greet') || t.includes('wave'))                          return 'Wave'
  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'
  return isMoving ? 'Walking' : 'Idle'
}

export function Humans3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const selectOrg = useUIStore(s => s.selectOrg)
  const { scene, animations } = useGLTF('/models/robot-expressive.glb')

  if (!depthMap || !biomes) return null

  return (
    <>
      {organisms.map(o => {
        if (!o.alive) return null
        const [vx, vy] = getOrgVelocityXY(o.id)
        const moving = Math.hypot(vx, vy) > 0.05
        // Distance gate for the animation mixer. We DON'T gate the
        // figure itself - rendering happens for every org.
        const dx = o.x * TILE_SCALE - camera.position.x
        const dz = o.y * TILE_SCALE - camera.position.z
        const animate = dx * dx + dz * dz <= ANIMATE_RADIUS_SQ
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
              getHeading={() => getOrgHeading(o.id)}
              scale={0.45}
              animation={pickAnim(o, moving)}
              color={lineageColor(o.lineage_id)}
              animate={animate}
            />
          </group>
        )
      })}
    </>
  )
}

useGLTF.preload('/models/robot-expressive.glb')
