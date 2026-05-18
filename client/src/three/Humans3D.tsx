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

function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'
  const t = (o.thought || '').toLowerCase()

  if (t.includes('rest') || t.includes('sleep') || t.includes('sitting')
      || t.includes('nap') || t.includes('meditat') || t.includes('vision quest')
      || t.includes('quiet moment') || t.includes('reflecting')
      || t.includes('daydream') || t.includes('sitting by'))
    return 'Sitting'

  if (t.includes('dance') || t.includes('dancing') || t.includes('celebrat')
      || t.includes('festival') || t.includes('feast'))
    return 'Dance'

  if (t.includes('flee') || t.includes('chase') || t.includes('hunt')
      || t.includes('raid') || t.includes('ambush') || t.includes('intercept')
      || t.includes('patrol') || t.includes('warband') || t.includes('rallying'))
    return 'Running'

  if (t.includes('greet') || t.includes('wave') || t.includes('welcoming')
      || t.includes('hosting') || t.includes('howling'))
    return 'Wave'

  if (t.includes('duel') || t.includes('punch') || t.includes('throw')
      || t.includes('hurling') || t.includes('challeng'))
    return 'Punch'

  if (t.includes('praising') || t.includes('blessing') || t.includes('thumbs')
      || t.includes('rite-of') || t.includes('coming-of-age'))
    return 'ThumbsUp'

  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'

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
        const speed = Math.hypot(vx, vy)
        const moving = speed > 0.05
        let scale = 0.45
        if      (o.age < 500)        scale = 0.30
        else if (o.age < 900)        scale = 0.36
        else if (o.age > 3000)       scale = 0.42
        if (o.pregnant) scale *= 1.10
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
              color={lineageColor(o.lineage_id)}
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
