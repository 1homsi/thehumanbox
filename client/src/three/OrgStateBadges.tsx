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

const BADGE_RADIUS_SQ = 180 * 180

function badgesFor(o: OrganismState): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = []
  const th = (o.thought || '').toLowerCase()

  // Status
  if (th.includes('sleep') || th.includes('nap') || th.includes('daydream'))
    out.push({ text: 'z', color: '#a8c0e0' })
  if (o.pregnant)
    out.push({ text: '♥', color: '#ff8aa8' })
  if (o.is_elder)
    out.push({ text: '◈', color: '#ffcf6a' })
  if ((o.fear_level ?? 0) > 0.60)
    out.push({ text: '!', color: '#ff7050' })
  if (o.attracted_to)
    out.push({ text: '✦', color: '#ffa0d0' })

  // Activities — make the AI feel alive and purposeful
  if (th.includes('building') || th.includes('constructing') || th.includes('building shelter'))
    out.push({ text: '⊞', color: '#f0c040' })
  if (th.includes('tilling') || th.includes('foraging') || th.includes('gathering') || th.includes('farming'))
    out.push({ text: '✿', color: '#80d840' })
  if (th.includes('singing') || th.includes('dancing') || th.includes('dance') || th.includes('celebrat'))
    out.push({ text: '♩', color: '#d080ff' })
  if (th.includes('socializing') || th.includes('chatting') || th.includes('conversation')
      || th.includes('greeting') || th.includes('treaty'))
    out.push({ text: '◉', color: '#60c8f0' })
  if (th.includes('hunting') || th.includes('tracking') || th.includes('stalking'))
    out.push({ text: '◎', color: '#e07830' })
  if (th.includes('storing') || th.includes('carrying') || th.includes('transporting'))
    out.push({ text: '▣', color: '#c09060' })

  // Emotional states
  if (o.grief_ticks && o.grief_ticks > 15)
    out.push({ text: '◌', color: '#6090c0' })
  if (o.infection > 0.30)
    out.push({ text: '+', color: '#80ff44' })
  if ((o.loneliness ?? 0) > 0.7)
    out.push({ text: '○', color: '#8080c0' })

  // Cap to avoid cluttered badges
  return out.slice(0, 3)
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

function BadgeRow({ orgId, badges, depthMap, biomes }: {
  orgId: string
  badges: { text: string; color: string }[]
  depthMap: number[][]
  biomes: number[][]
}) {
  const groupRef = useRef<THREE.Group>(null)
  const phase = useMemo(() => {
    let h = 0
    for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) | 0
    return (h & 0xffff) / 0xffff * Math.PI * 2
  }, [orgId])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime() + phase
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
