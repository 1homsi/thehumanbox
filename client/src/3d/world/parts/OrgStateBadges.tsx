import { useMemo, useRef } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Group } from 'three'
import type { OrganismState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const BADGE_RADIUS_SQ = 180 * 180

// Entirely data-driven: every badge comes from a real numeric field on OrganismState.
// No thought-text matching here - the server's AI drives the numbers, we visualize them.
function badgesFor(o: OrganismState): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = []

  // Survival needs (actual thresholds, not text)
  if (o.energy < 0.22) out.push({ text: '▽', color: '#ff9040' }) // hungry
  if (o.hydration < 0.22) out.push({ text: '≈', color: '#40b0ff' }) // thirsty
  if (o.infection > 0.22) out.push({ text: '+', color: '#80ff44' }) // infected
  if ((o.sleep_debt ?? 0) > 0.5) out.push({ text: 'z', color: '#a8c0e0' }) // sleep-deprived

  // Emotional state (actual fields)
  if ((o.fear_level ?? 0) > 0.58) out.push({ text: '!', color: '#ff7050' }) // afraid
  if ((o.grief_ticks ?? 0) > 12) out.push({ text: '◌', color: '#6090c0' }) // grieving
  if ((o.loneliness ?? 0) > 0.65) out.push({ text: '○', color: '#8080c0' }) // isolated
  if ((o.boredom ?? 0) > 0.7) out.push({ text: '·', color: '#909090' }) // bored

  // Relational / life events
  if (o.pregnant) out.push({ text: '♥', color: '#ff8aa8' }) // pregnant
  if (o.attracted_to) out.push({ text: '♡', color: '#ffa0c0' }) // attracted
  if (o.carrying > 0) out.push({ text: '▣', color: '#c09060' }) // carrying something
  if ((o.comfort ?? 0) > 0.8) out.push({ text: '✦', color: '#ffe080' })
  if ((o.joy_ticks ?? 0) > 0) out.push({ text: '☀', color: '#ffd866' })

  // Status markers
  if (o.is_elder) out.push({ text: '◈', color: '#ffcf6a' }) // elder
  if ((o.traits?.aggression ?? 0) > 0.8) out.push({ text: '⚡', color: '#ff5020' }) // aggressive trait
  if ((o.traits?.social_tendency ?? 0) > 0.8) out.push({ text: '◉', color: '#60c8f0' }) // highly social

  // Extended emotional fields (new this session)
  if ((o.hope ?? 0) > 0.75) out.push({ text: '◇', color: '#a8e0ff' })
  if ((o.awe ?? 0) > 0.5) out.push({ text: '✶', color: '#d8c8ff' })
  if ((o.gratitude ?? 0) > 0.6) out.push({ text: '⌖', color: '#ffd890' })
  if ((o.jealousy ?? 0) > 0.55) out.push({ text: '⌅', color: '#90a050' })
  if ((o.anger ?? 0) > 0.55) out.push({ text: '⚞', color: '#ff5028' })
  if ((o.regret ?? 0) > 0.55) out.push({ text: '⊘', color: '#7080a8' })
  if ((o.spiritual ?? 0) > 0.7) out.push({ text: '☥', color: '#e0c068' })

  // Cap at 4 to avoid clutter
  return out.slice(0, 4)
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
  }, [organisms, camera.position.x, camera.position.z])

  return (
    <>
      {near.map(({ o, badges }) => (
        <BadgeRow key={o.id} orgId={o.id} badges={badges} depthMap={depthMap} biomes={biomes} />
      ))}
    </>
  )
}

function BadgeRow({
  orgId,
  badges,
  depthMap,
  biomes,
}: {
  orgId: string
  badges: { text: string; color: string }[]
  depthMap: number[][]
  biomes: number[][]
}) {
  const groupRef = useRef<Group>(null)
  const phase = useMemo(() => {
    let h = 0
    for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) | 0
    return ((h & 0xffff) / 0xffff) * Math.PI * 2
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
        child.position.x = (i - (badges.length - 1) / 2) * 0.7 + Math.sin(t * 18) * 0.06
      }
    })
  })

  const [tx, ty] = getOrgXY(orgId)
  const groundY = heightAt(tx, ty, depthMap, biomes)
  return (
    <Billboard position={[tx * TILE_SCALE, groundY + 3.4, ty * TILE_SCALE]} frustumCulled={false}>
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
