import { useMemo } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrganismState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Small status icons that float above an org's head when their
// internal state warrants it. Reads as "this character is doing X
// right now" at a glance:
//
//   z  - sleeping / resting (thought contains 'sleep' or 'rest')
//   ♥  - pregnant (orange)
//   ◊  - elder (gold)
//   !  - afraid (fear_level > 0.6)
//   *  - in love / courting
//
// Only renders for orgs within BADGE_RADIUS_SQ of the camera so we
// don't spam billboards across the whole world.
const BADGE_RADIUS_SQ = 180 * 180

function badgesFor(o: OrganismState): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = []
  const th = (o.thought || '').toLowerCase()
  if (th.includes('sleep') || th.includes('resting') || th.includes('nap'))
    out.push({ text: 'z', color: '#a8c0e0' })
  if (o.pregnant)
    out.push({ text: '♥', color: '#ff8aa8' })
  if (o.is_elder)
    out.push({ text: '◈', color: '#ffcf6a' })
  if ((o.fear_level ?? 0) > 0.6)
    out.push({ text: '!', color: '#ff7050' })
  if (o.attracted_to)
    out.push({ text: '✦', color: '#ffa0d0' })
  return out
}

export function OrgStateBadges({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()

  const near = useMemo(() => {
    const out: { o: OrganismState; badges: { text: string; color: string }[] }[] = []
    const cx = camera.position.x
    const cz = camera.position.z
    for (const o of organisms) {
      if (!o.alive) continue
      const dx = o.x * TILE_SCALE - cx
      const dz = o.y * TILE_SCALE - cz
      if (dx * dx + dz * dz > BADGE_RADIUS_SQ) continue
      const badges = badgesFor(o)
      if (badges.length === 0) continue
      out.push({ o, badges })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  return (
    <>
      {near.map(({ o, badges }) => {
        const [tx, ty] = getOrgXY(o.id)
        const groundY = heightAt(tx, ty, depthMap, biomes)
        return (
          <Billboard
            key={o.id}
            position={[tx * TILE_SCALE, groundY + 3.4, ty * TILE_SCALE]}
            frustumCulled={false}
          >
            <group>
              {badges.map((b, i) => (
                <Text
                  key={b.text + i}
                  fontSize={0.55}
                  color={b.color}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.04}
                  outlineColor="#000000"
                  outlineOpacity={0.85}
                  position={[(i - (badges.length - 1) / 2) * 0.7, 0, 0]}
                  renderOrder={995}
                >
                  {b.text}
                </Text>
              ))}
            </group>
          </Billboard>
        )
      })}
    </>
  )
}
