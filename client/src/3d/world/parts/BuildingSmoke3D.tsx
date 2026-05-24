import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D, PlaneGeometry } from 'three'
import type { Building, BuildingKind } from '../../../types'
import { heightAt } from './terrain-utils'
import { TILE_SCALE } from './constants'

interface Props {
  buildings: Building[]
  depthMap: number[][]
  biomes: number[][]
}

interface SmokeSourceSpec {
  // Where above the building base the smoke spawns.
  yOffset: number
  // Lateral offset from the building anchor (chimney usually slightly off centre).
  dx: number
  dz: number
  // How thick the column is (scale multiplier).
  thickness: number
  // How fast the smoke climbs.
  rise: number
  // Particles per source.
  count: number
  // Opacity multiplier.
  opacity: number
}

const SMOKE_SOURCES: Partial<Record<string, SmokeSourceSpec>> = {
  House: { yOffset: 6.4, dx: 2.4, dz: 2.0, thickness: 0.55, rise: 1.6, count: 5, opacity: 0.45 },
  Manor: { yOffset: 10.4, dx: 3.6, dz: 3.0, thickness: 0.7, rise: 1.5, count: 6, opacity: 0.5 },
  TownHouse: { yOffset: 13.8, dx: 1.6, dz: 1.5, thickness: 0.45, rise: 1.8, count: 5, opacity: 0.4 },
  Apartment: { yOffset: 15.5, dx: 2.0, dz: 1.8, thickness: 0.6, rise: 1.7, count: 6, opacity: 0.45 },
  Bakery: { yOffset: 5.6, dx: 1.4, dz: -1.0, thickness: 0.5, rise: 1.8, count: 6, opacity: 0.55 },
  Brewery: { yOffset: 8.6, dx: 1.5, dz: -1.2, thickness: 0.7, rise: 1.5, count: 8, opacity: 0.6 },
  Forge: { yOffset: 5.5, dx: 0, dz: -1.2, thickness: 0.6, rise: 2.0, count: 7, opacity: 0.5 },
  Smithy: { yOffset: 5.5, dx: 0, dz: -1.2, thickness: 0.6, rise: 2.0, count: 7, opacity: 0.5 },
  Factory: { yOffset: 9.6, dx: 1.6, dz: -1.4, thickness: 0.9, rise: 2.3, count: 10, opacity: 0.7 },
  Refinery: { yOffset: 11.7, dx: 2.0, dz: 0, thickness: 1.1, rise: 2.4, count: 12, opacity: 0.75 },
  PowerPlant: { yOffset: 7.6, dx: 1.4, dz: -1.0, thickness: 0.9, rise: 2.0, count: 10, opacity: 0.6 },
  Tavern: { yOffset: 6.0, dx: 1.6, dz: 1.6, thickness: 0.5, rise: 1.6, count: 5, opacity: 0.4 },
  Inn: { yOffset: 6.0, dx: 1.8, dz: 1.6, thickness: 0.55, rise: 1.6, count: 6, opacity: 0.45 },
  Hospital: { yOffset: 6.3, dx: 1.0, dz: 1.5, thickness: 0.4, rise: 1.7, count: 4, opacity: 0.35 },
}

const SMOKE_GEO = new PlaneGeometry(1, 1)
const SMOKE_WRAP_H = 12
const tmp = new Object3D()

export function BuildingSmoke3D({ buildings, depthMap, biomes }: Props) {
  // Bucket alive buildings by kind so we can build one InstancedMesh per
  // emitter type — keeps draw calls bounded.
  const grouped: Map<BuildingKind, [number, number, number][]> = new Map()
  for (const b of buildings) {
    const spec = SMOKE_SOURCES[b.kind]
    if (!spec) continue
    const ground = heightAt(b.x, b.y, depthMap, biomes)
    const arr = grouped.get(b.kind) ?? []
    arr.push([b.x * TILE_SCALE, ground, b.y * TILE_SCALE])
    grouped.set(b.kind, arr)
  }

  if (grouped.size === 0) return null

  return (
    <>
      {Array.from(grouped.entries()).map(([kind, positions]) => (
        <SmokeColumns
          key={`smoke-${kind}`}
          positions={positions}
          spec={SMOKE_SOURCES[kind as string]!}
        />
      ))}
    </>
  )
}

function SmokeColumns({
  positions,
  spec,
}: {
  positions: [number, number, number][]
  spec: SmokeSourceSpec
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const total = positions.length * spec.count

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh || total === 0) return
    const t = clock.getElapsedTime()
    let inst = 0
    for (let s = 0; s < positions.length; s++) {
      const [px, py, pz] = positions[s]
      for (let p = 0; p < spec.count; p++) {
        const phase = (s * 0.41 + p * 1.13) % 1
        const lifeRaw = (t * spec.rise + phase * SMOKE_WRAP_H) % SMOKE_WRAP_H
        const life = lifeRaw / SMOKE_WRAP_H
        const y = py + spec.yOffset + life * SMOKE_WRAP_H * 1.0
        const drift = life * 1.6 * spec.thickness
        const x = px + spec.dx + Math.cos(t * 0.5 + phase * 6) * drift
        const z = pz + spec.dz + Math.sin(t * 0.4 + phase * 5) * drift
        const scale = (0.5 + life * 2.4) * spec.thickness
        tmp.position.set(x, y, z)
        tmp.lookAt(camera.position)
        tmp.scale.set(scale, scale, scale)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst++, tmp.matrix)
      }
    }
    mesh.count = inst
    mesh.instanceMatrix.needsUpdate = true
  })

  if (total === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[SMOKE_GEO, undefined, total]} frustumCulled={false}>
      <meshBasicMaterial color="#aab0b4" transparent opacity={spec.opacity} depthWrite={false} />
    </instancedMesh>
  )
}
