import { RoundedBox, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group } from 'three'
import type { OrganismState } from '../../../types'
import { TILE_SCALE } from './constants'
import { getOrgXY } from './motion-state'
import { heightAt } from './terrain-utils'
import { displayThought } from './thought-bubbles'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const MAX_BUBBLES = 7
const MAX_DISTANCE_SQ = 115 * 115

function thoughtPriority(org: OrganismState): number {
  return (
    (org.joy_ticks ?? 0) * 0.002 +
    (org.grief_ticks ?? 0) * 0.003 +
    (org.fear_level ?? 0) * 4 +
    (org.loneliness ?? 0) * 2 +
    (org.attracted_to ? 2 : 0) +
    (org.carrying > 0 ? 0.5 : 0)
  )
}

export function ThoughtBubbles3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const visible = useMemo(() => {
    const candidates: { org: OrganismState; text: string; score: number }[] = []
    for (const org of organisms) {
      if (!org.alive) continue
      const text = displayThought(org.thought ?? '')
      if (!text) continue
      const dx = org.x * TILE_SCALE - camera.position.x
      const dz = org.y * TILE_SCALE - camera.position.z
      const distanceSq = dx * dx + dz * dz
      if (distanceSq > MAX_DISTANCE_SQ) continue
      candidates.push({ org, text, score: thoughtPriority(org) - distanceSq / MAX_DISTANCE_SQ })
    }
    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, MAX_BUBBLES)
  }, [organisms, camera.position.x, camera.position.z])

  return visible.map(({ org, text }, index) => (
    <ThoughtBubble
      key={`${org.id}:${text}`}
      orgId={org.id}
      text={text}
      index={index}
      depthMap={depthMap}
      biomes={biomes}
    />
  ))
}

function ThoughtBubble({
  orgId,
  text,
  index,
  depthMap,
  biomes,
}: {
  orgId: string
  text: string
  index: number
  depthMap: number[][]
  biomes: number[][]
}) {
  const ref = useRef<Group>(null)
  const phase = useMemo(
    () => orgId.split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7) * 0.001,
    [orgId],
  )
  const width = Math.min(8.8, Math.max(3.2, text.length * 0.18))

  useFrame(({ clock, camera }) => {
    const group = ref.current
    if (!group) return
    const [x, z] = getOrgXY(orgId)
    const ground = heightAt(x, z, depthMap, biomes)
    group.position.set(
      x * TILE_SCALE,
      ground + 6.2 + Math.sin(clock.elapsedTime * 1.7 + phase) * 0.12,
      z * TILE_SCALE,
    )
    const distance = group.position.distanceTo(camera.position)
    const scale = Math.min(1.25, Math.max(0.72, distance / 80))
    group.scale.setScalar(scale)
    camera.getWorldQuaternion(group.quaternion)
  })

  return (
    <group ref={ref}>
      <RoundedBox args={[width, 1.05, 0.08]} radius={0.18} smoothness={3} renderOrder={980 - index}>
        <meshBasicMaterial color="#10151b" transparent opacity={0.78} depthWrite={false} />
      </RoundedBox>
      <Text
        position={[0, 0.02, 0.08]}
        fontSize={0.38}
        maxWidth={width - 0.5}
        color="#f1eadb"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.018}
        outlineColor="#000000"
        renderOrder={981 - index}
      >
        {text}
      </Text>
      <mesh position={[-width * 0.25, -0.62, 0]} rotation={[0, 0, Math.PI / 4]} renderOrder={979 - index}>
        <planeGeometry args={[0.42, 0.42]} />
        <meshBasicMaterial color="#10151b" transparent opacity={0.78} depthWrite={false} />
      </mesh>
    </group>
  )
}
