import { useMemo, useRef } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
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
      {near.map(({ o, badges }) => (
        <BadgeRow
          key={o.id}
          orgId={o.id}
          badges={badges}
          depthMap={depthMap}
          biomes={biomes}
        />
      ))}
    </>
  )
}

// Per-org badge group with subtle animation: 'z' bobs upward (sleep),
// '♥' pulses (pregnancy), '!' jitters (fear). Each badge animates
// independently so the badge row reads as expressive rather than
// static decals.
function BadgeRow({ orgId, badges, depthMap, biomes }: {
  orgId: string
  badges: { text: string; color: string }[]
  depthMap: number[][]
  biomes: number[][]
}) {
  const groupRef = useRef<THREE.Group>(null)
  const phase = useMemo(() => {
    // Stable per-org phase offset.
    let h = 0
    for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) | 0
    return (h & 0xffff) / 0xffff * Math.PI * 2
  }, [orgId])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime() + phase
    // Children animate based on their character.
    groupRef.current.children.forEach((child, i) => {
      const b = badges[i]
      if (!b) return
      if (b.text === 'z') {
        child.position.y = Math.sin(t * 2.2) * 0.18
      } else if (b.text === '♥') {
        const s = 1 + Math.sin(t * 3) * 0.18
        child.scale.set(s, s, s)
      } else if (b.text === '!') {
        child.position.x = (i - (badges.length - 1) / 2) * 0.7
                          + Math.sin(t * 18) * 0.06
      }
    })
  })

  const [tx, ty] = getOrgXY(orgId)
  const groundY = heightAt(tx, ty, depthMap, biomes)
  return (
    <Billboard
      position={[tx * TILE_SCALE, groundY + 3.4, ty * TILE_SCALE]}
      frustumCulled={false}
    >
      <group ref={groupRef}>
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
}
