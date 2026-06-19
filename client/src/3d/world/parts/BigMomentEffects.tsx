import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { DoubleSide, type Mesh, type MeshBasicMaterial } from 'three'
import type { BattleInfo, OrganismState, SimEvent, WorldState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  events: SimEvent[]
  organisms: OrganismState[]
  world: WorldState
  depthMap: number[][]
  biomes: number[][]
}

type MomentKind =
  | 'death'
  | 'birth'
  | 'partnership'
  | 'era_up'
  | 'religion_milestone'
  | 'war_declared'
  | 'milestone'
  | 'first_build'

interface Moment {
  key: string
  kind: MomentKind
  worldX: number
  worldZ: number
  groundY: number
  born: number
  label?: string
}

const LIFE_MS: Record<MomentKind, number> = {
  death: 2600,
  birth: 2400,
  partnership: 3200,
  era_up: 5500,
  religion_milestone: 4400,
  war_declared: 5200,
  milestone: 4600,
  first_build: 3400,
}

const COLORS: Record<MomentKind, string> = {
  death: '#c8a0a0',
  birth: '#90ffb0',
  partnership: '#ff7aa8',
  era_up: '#ffd860',
  religion_milestone: '#c8a8ff',
  war_declared: '#ff5a3a',
  milestone: '#88e0d0',
  first_build: '#d8b270',
}

const MAX_MOMENTS = 32

function classify(e: SimEvent): MomentKind | null {
  const t = (e.type || '').toLowerCase()
  const d = (e.detail || '').toLowerCase()
  if (t === 'died' || t === 'death' || d.includes('died') || d.includes('passed away')) return 'death'
  if (t === 'born' || t === 'birth' || d.includes('was born') || d.includes('newborn')) return 'birth'
  if (
    t === 'partnership' ||
    d.includes('became partners') ||
    d.includes('married') ||
    d.includes('paired with')
  )
    return 'partnership'
  if (t === 'war_declared') return 'war_declared'
  if (t === 'religion' && (d.includes('reached') || d.includes('milestone'))) return 'religion_milestone'
  if (t === 'milestone' || d.includes('the world')) return 'milestone'
  if (
    t === 'built' &&
    (d.includes('cathedral') ||
      d.includes('castle') ||
      d.includes('factory') ||
      d.includes('datacenter') ||
      d.includes('university'))
  )
    return 'first_build'
  if (t === 'era' || d.includes('entered the') || d.includes('became a')) return 'era_up'
  return null
}

export function BigMomentEffects({ events, organisms, world, depthMap, biomes }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const momentsRef = useRef<Moment[]>([])
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => (v + 1) & 0x7fffffff)

  const orgByName = useMemo(() => {
    const m = new Map<string, OrganismState>()
    for (const o of organisms) m.set(o.name, o)
    return m
  }, [organisms])

  const lineageCentroid = useMemo(() => {
    const sums = new Map<string, { x: number; y: number; n: number }>()
    for (const o of organisms) {
      if (!o.alive) continue
      const e = sums.get(o.lineage_id) ?? { x: 0, y: 0, n: 0 }
      e.x += o.x
      e.y += o.y
      e.n++
      sums.set(o.lineage_id, e)
    }
    const m = new Map<string, [number, number]>()
    for (const [lid, s] of sums) {
      if (s.n > 0) m.set(lid, [s.x / s.n, s.y / s.n])
    }
    return m
  }, [organisms])

  let spawned = 0
  for (const e of events) {
    const key = `${e.tick}|${e.actor}|${e.type}|${e.detail}`
    if (seenRef.current.has(key)) continue
    const kind = classify(e)
    if (!kind) {
      seenRef.current.add(key)
      continue
    }
    seenRef.current.add(key)
    let wx: number | null = null
    let wy: number | null = null
    const org = orgByName.get(e.actor)
    if (org) {
      const [tx, ty] = getOrgXY(org.id)
      wx = tx
      wy = ty
    } else {
      const centroid = lineageCentroid.get(e.actor)
      if (centroid) {
        wx = centroid[0]
        wy = centroid[1]
      }
    }
    if (wx == null || wy == null) {
      if (kind === 'milestone' || kind === 'era_up' || kind === 'religion_milestone') {
        const all = world.organisms ?? []
        if (all.length === 0) continue
        let sx = 0
        let sy = 0
        let n = 0
        for (const o of all) {
          if (!o.alive) continue
          sx += o.x
          sy += o.y
          n++
        }
        if (n === 0) continue
        wx = sx / n
        wy = sy / n
      } else {
        continue
      }
    }
    const groundY = heightAt(wx, wy, depthMap, biomes)
    momentsRef.current.push({
      key,
      kind,
      worldX: wx * TILE_SCALE,
      worldZ: wy * TILE_SCALE,
      groundY,
      born: performance.now(),
      label: e.detail,
    })
    spawned++
  }
  if (momentsRef.current.length > MAX_MOMENTS) {
    momentsRef.current.splice(0, momentsRef.current.length - MAX_MOMENTS)
  }
  if (seenRef.current.size > 1200) {
    seenRef.current = new Set(Array.from(seenRef.current).slice(-600))
  }
  if (spawned > 0) queueMicrotask(bump)

  useFrame(() => {
    const now = performance.now()
    const before = momentsRef.current.length
    momentsRef.current = momentsRef.current.filter((m) => now - m.born < LIFE_MS[m.kind])
    if (momentsRef.current.length !== before) bump()
  })

  const now = performance.now()

  return (
    <>
      {momentsRef.current.map((m) => {
        const life = LIFE_MS[m.kind]
        const age = (now - m.born) / life
        const color = COLORS[m.kind]
        return (
          <group key={m.key} position={[m.worldX, m.groundY, m.worldZ]}>
            <Pop kind={m.kind} age={age} color={color} label={m.label} />
          </group>
        )
      })}
      <BattleMarkers battles={world.battles ?? []} depthMap={depthMap} biomes={biomes} />
    </>
  )
}

const BATTLE_HEIGHT: Record<string, number> = {
  Skirmish: 5,
  Raid: 7,
  Siege: 11,
  Battle: 13,
  War: 18,
}

function BattleMarkers({
  battles,
  depthMap,
  biomes,
}: {
  battles: BattleInfo[]
  depthMap: number[][]
  biomes: number[][]
}) {
  const active = battles.filter((b) => !b.ended)
  if (active.length === 0) return null
  return (
    <>
      {active.map((b) => {
        const [tx, ty] = b.location
        const groundY = heightAt(tx, ty, depthMap, biomes)
        return (
          <group key={b.id} position={[tx * TILE_SCALE, groundY, ty * TILE_SCALE]}>
            <BattleMarker scale={b.scale} />
          </group>
        )
      })}
    </>
  )
}

function BattleMarker({ scale }: { scale: string }) {
  const ringRef = useRef<Mesh>(null)
  const beamRef = useRef<Mesh>(null)
  const height = BATTLE_HEIGHT[scale] ?? 8
  const color = COLORS.war_declared

  useFrame(({ clock }) => {
    const p = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 5)
    const ring = ringRef.current
    if (ring) {
      const s = 1 + p * 0.7
      ring.scale.set(s, s, s)
      ;(ring.material as MeshBasicMaterial).opacity = 0.3 + p * 0.45
    }
    const beam = beamRef.current
    if (beam) {
      ;(beam.material as MeshBasicMaterial).opacity = 0.25 + p * 0.4
    }
  })

  return (
    <group>
      <mesh ref={ringRef} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 3.0, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.5, 1.1, height, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Billboard position={[0, height + 1.6, 0]} frustumCulled={false}>
        <Text
          fontSize={1.1}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.08}
          outlineColor="#000"
          renderOrder={998}
        >
          {`⚔ ${scale}`}
        </Text>
      </Billboard>
    </group>
  )
}

function Pop({ kind, age, color, label }: { kind: MomentKind; age: number; color: string; label?: string }) {
  const fade = Math.max(0, 1 - age)
  switch (kind) {
    case 'era_up':
      return <Pillar age={age} color={color} height={22} radius={1.4} label={label} />
    case 'religion_milestone':
      return <Pillar age={age} color={color} radius={1.2} height={14} label={label} />
    case 'war_declared':
      return <Flash age={age} color={color} label={label} icon="⚔" />
    case 'milestone':
      return <Pillar age={age} color={color} height={18} label={label} />
    case 'first_build':
      return <Flash age={age} color={color} label={label} icon="✦" />
    case 'partnership':
      return <Hearts age={age} color={color} />
    case 'birth':
      return <Spark age={age} color={color} />
    case 'death':
    default:
      return (
        <Billboard position={[0, 1.5, 0]} frustumCulled={false}>
          <mesh>
            <circleGeometry args={[0.6 + age * 1.4, 16]} />
            <meshBasicMaterial color={color} transparent opacity={fade * 0.55} side={DoubleSide} />
          </mesh>
        </Billboard>
      )
  }
}

function Pillar({
  age,
  color,
  height = 12,
  radius = 0.9,
  label,
}: {
  age: number
  color: string
  height?: number
  radius?: number
  label?: string
}) {
  const fade = Math.max(0, 1 - age)
  const rise = Math.min(1, age * 2.2)
  return (
    <group>
      <mesh position={[0, (height * rise) / 2, 0]}>
        <cylinderGeometry args={[radius * (0.6 + 0.4 * fade), radius * 1.3, height * rise, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={fade * 0.55} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.0, radius * (1.0 + age * 2.5), 32]} />
        <meshBasicMaterial color={color} transparent opacity={fade * 0.7} side={DoubleSide} />
      </mesh>
      {label && (
        <Billboard position={[0, height * rise + 1.4, 0]} frustumCulled={false}>
          <Text
            fontSize={0.7}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000"
            outlineOpacity={fade * 0.9}
            fillOpacity={fade}
            renderOrder={998}
          >
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function Flash({ age, color, label, icon }: { age: number; color: string; label?: string; icon?: string }) {
  const fade = Math.max(0, 1 - age)
  const scale = 1 + age * 3
  return (
    <Billboard position={[0, 3.5, 0]} frustumCulled={false}>
      <mesh>
        <circleGeometry args={[0.8 * scale, 24]} />
        <meshBasicMaterial color={color} transparent opacity={fade * 0.45} side={DoubleSide} />
      </mesh>
      {icon && (
        <Text
          fontSize={1.6}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.08}
          outlineColor="#000"
          outlineOpacity={fade}
          fillOpacity={fade}
          renderOrder={998}
        >
          {icon}
        </Text>
      )}
      {label && (
        <Text
          position={[0, -1.6, 0]}
          fontSize={0.55}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000"
          outlineOpacity={fade * 0.9}
          fillOpacity={fade}
          renderOrder={998}
        >
          {label}
        </Text>
      )}
    </Billboard>
  )
}

function Hearts({ age, color }: { age: number; color: string }) {
  const fade = Math.max(0, 1 - age)
  const rise = age * 4
  return (
    <Billboard position={[0, 1.8 + rise, 0]} frustumCulled={false}>
      <Text
        fontSize={1.6}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000"
        outlineOpacity={fade}
        fillOpacity={fade}
        renderOrder={998}
      >
        ♥
      </Text>
    </Billboard>
  )
}

function Spark({ age, color }: { age: number; color: string }) {
  const fade = Math.max(0, 1 - age)
  const grow = 0.3 + age * 1.0
  return (
    <Billboard position={[0, 1.4, 0]} frustumCulled={false}>
      <mesh>
        <circleGeometry args={[grow, 12]} />
        <meshBasicMaterial color={color} transparent opacity={fade * 0.7} side={DoubleSide} />
      </mesh>
      <Text
        fontSize={0.9}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor={color}
        outlineOpacity={fade}
        fillOpacity={fade}
        renderOrder={998}
      >
        ✦
      </Text>
    </Billboard>
  )
}
