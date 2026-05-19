import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrganismState } from '../types'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getOrgXY, getOrgVelocityXY, getOrgHeading } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

const ANIMATE_RADIUS_SQ = 220 * 220

// Data-driven: organism is inside their home when they're genuinely at rest
// Uses actual numeric fields — sleep_debt, energy — not thought text
function isInsideHouse(o: OrganismState): boolean {
  if (!o.home_x || !o.home_y) return false
  const dx = o.x - o.home_x; const dy = o.y - o.home_y
  if (dx * dx + dy * dy >= 2.0) return false // not at home tile
  // Truly resting: either actually tired or energy-depleted
  return (o.sleep_debt ?? 0) > 0.40
    || o.energy < 0.10
    || o.health < 0.15 // too hurt to be outside
}

// Animation selected from actual organism state — fields first, thought text as weak fallback
function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'

  // Hard data overrides first
  if ((o.sleep_debt ?? 0) > 0.55 || o.energy < 0.08 || o.health < 0.12)
    return 'Sitting' // exhausted / incapacitated
  if (o.grief_ticks && o.grief_ticks > 10)
    return 'Sitting' // grief — subdued posture
  if ((o.fear_level ?? 0) > 0.80 && isMoving)
    return 'Running' // flight response from actual fear field
  if (o.infection > 0.55)
    return 'Sitting' // very sick → collapsed

  // Trait-influenced: highly aggressive organism swings more
  if ((o.traits?.aggression ?? 0) > 0.85 && isMoving)
    return 'Running'

  // Thought text as fallback for actions that have no dedicated field
  const t = (o.thought || '').toLowerCase()
  if (t.includes('dance') || t.includes('celebrat') || t.includes('feast'))
    return 'Dance'
  if (t.includes('duel') || t.includes('punch') || t.includes('challeng') || t.includes('throw'))
    return 'Punch'
  if (t.includes('greet') || t.includes('wave') || t.includes('welcoming'))
    return 'Wave'
  if (t.includes('praising') || t.includes('blessing') || t.includes('coming-of-age'))
    return 'ThumbsUp'
  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'
  if (t.includes('flee') || t.includes('raid') || t.includes('ambush'))
    return 'Running'
  if (t.includes('rest') || t.includes('sleep') || t.includes('sit') || t.includes('meditat'))
    return 'Sitting'

  return isMoving ? 'Walking' : 'Idle'
}

// Color driven entirely by actual emotional/health state — no text matching
function orgColor(o: OrganismState): string {
  if (o.infection > 0.38)                      return 'hsl(85,  62%, 42%)'  // sick: sickly green
  if ((o.fear_level ?? 0) > 0.72)              return 'hsl(10,  72%, 38%)'  // fear: deep red-orange
  if ((o.grief_ticks ?? 0) > 14)               return 'hsl(220, 52%, 40%)'  // grief: washed blue
  if (o.energy < 0.12)                         return 'hsl(38,  55%, 30%)'  // starving: dark earth
  if ((o.comfort ?? 0) > 0.82)                 return 'hsl(50,  80%, 58%)'  // content: warm gold
  if ((o.traits?.aggression ?? 0) > 0.80)      return 'hsl(0,   60%, 48%)'  // aggressive: muted red
  return lineageColor(o.lineage_id)                                           // default: lineage hue
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
        if (isInsideHouse(o)) return null

        const [vx, vy] = getOrgVelocityXY(o.id)
        const speed  = Math.hypot(vx, vy)
        const moving = speed > 0.05

        // Age-based scale
        let scale = 0.45
        if      (o.age < 500)  scale = 0.30
        else if (o.age < 900)  scale = 0.36
        else if (o.age > 3000) scale = 0.42
        if (o.pregnant) scale *= 1.10

        // Trait-driven body size: resilience → sturdier; fear trait → slightly smaller
        scale *= 0.88 + (o.traits?.resilience ?? 0.5) * 0.24
        // Health degradation shows physically
        scale *= 0.85 + Math.min(1, o.health) * 0.15

        const timeScale = Math.max(0.55, Math.min(2.4, 1.0 + speed * 1.4))
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
              scale={scale}
              animation={pickAnim(o, moving)}
              color={orgColor(o)}
              animate={animate}
              timeScale={timeScale}
            />
          </group>
        )
      })}
    </>
  )
}

useGLTF.preload('/models/robot-expressive.glb')
