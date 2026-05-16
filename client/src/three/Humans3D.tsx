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
//
// Order matters - more specific thought substrings first. Covers
// both the original 26..=125 action thoughts and the 126..=225 set
// added in extended_actions_v2.rs.
function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'
  const t = (o.thought || '').toLowerCase()

  // ── Sitting / resting / meditating ────────────────────────────────
  if (t.includes('rest') || t.includes('sleep') || t.includes('sitting')
      || t.includes('nap') || t.includes('meditat') || t.includes('vision quest')
      || t.includes('quiet moment') || t.includes('reflecting')
      || t.includes('daydream') || t.includes('sitting by'))
    return 'Sitting'

  // ── Dancing / celebrating / festivals ─────────────────────────────
  if (t.includes('dance') || t.includes('dancing') || t.includes('celebrat')
      || t.includes('festival') || t.includes('feast'))
    return 'Dance'

  // ── Running / fleeing / chasing / hunting ─────────────────────────
  if (t.includes('flee') || t.includes('chase') || t.includes('hunt')
      || t.includes('raid') || t.includes('ambush') || t.includes('intercept')
      || t.includes('patrol') || t.includes('warband') || t.includes('rallying'))
    return 'Running'

  // ── Greeting / waving / signalling ────────────────────────────────
  if (t.includes('greet') || t.includes('wave') || t.includes('welcoming')
      || t.includes('hosting') || t.includes('howling'))
    return 'Wave'

  // ── Punch / combat / duelling ─────────────────────────────────────
  if (t.includes('duel') || t.includes('punch') || t.includes('throw')
      || t.includes('hurling') || t.includes('challeng'))
    return 'Punch'

  // ── Thumbs-up / praise / blessing / approval ─────────────────────
  if (t.includes('praising') || t.includes('blessing') || t.includes('thumbs')
      || t.includes('rite-of') || t.includes('coming-of-age'))
    return 'ThumbsUp'

  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'

  // Default: walk if actually moving, otherwise idle.
  return isMoving ? 'Walking' : 'Idle'
}

export function Humans3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const selectOrg     = useUIStore(s => s.selectOrg)
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const { scene, animations } = useGLTF('/models/robot-expressive.glb')

  if (!depthMap || !biomes) return null

  return (
    <>
      {organisms.map(o => {
        if (!o.alive) return null
        const [vx, vy] = getOrgVelocityXY(o.id)
        const moving = Math.hypot(vx, vy) > 0.05
        // Distance gate for the animation mixer. We DON'T gate the
        // figure itself - rendering happens for every org. Always
        // animate the currently selected org so following them from
        // far away still reads as alive instead of frozen.
        const dx = o.x * TILE_SCALE - camera.position.x
        const dz = o.y * TILE_SCALE - camera.position.z
        const isSelected = o.id === selectedOrgId
        const animate = isSelected || dx * dx + dz * dz <= ANIMATE_RADIUS_SQ
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
