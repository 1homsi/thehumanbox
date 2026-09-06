import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { AnimalState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { buildPartsByKind } from './animal-model'
import { getAnimalXY, getAnimalHeading, getAnimalSpeed } from './motion-state'

interface Props {
  animals: AnimalState[]
  depthMap: number[][]
  biomes: number[][]
}

interface InstancedSpeciesProps {
  kind: AnimalState['kind']
  ids: number[]
  depthMap: number[][]
  biomes: number[][]
}

// Reused scratch - avoids per-frame allocation in useFrame.
const rootMat = new Matrix4()
const partMat = new Matrix4()
const finalMat = new Matrix4()
const scratchEuler = new Euler()
const scratchQuat = new Quaternion()
const scratchVec = new Vector3()
const scratchScale = new Vector3(1, 1, 1)

function InstancedSpecies({ kind, ids, depthMap, biomes }: InstancedSpeciesProps) {
  const parts = useMemo(() => buildPartsByKind(kind), [kind])
  const geometries = useMemo(() => parts.map((part) => part.geom()), [parts])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  // One mesh per part. We size capacity to ids.length and let React
  // re-create instances when capacity changes (rare - populations move
  // slowly relative to render rate).
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const count = ids.length
  const quadruped = kind === 'deer' || kind === 'boar' || kind === 'wolf' || kind === 'dog'

  // Per-part baked local matrix (offset · rotation · scale). Computed
  // once per parts change, reused every frame.
  const partLocalMats = useMemo(() => {
    return parts.map((p) => {
      const m = new Matrix4()
      scratchEuler.set(p.rot[0], p.rot[1], p.rot[2])
      scratchQuat.setFromEuler(scratchEuler)
      scratchVec.set(p.offset[0], p.offset[1], p.offset[2])
      const sc = p.scale ?? [1, 1, 1]
      scratchScale.set(sc[0], sc[1], sc[2])
      m.compose(scratchVec, scratchQuat, scratchScale)
      return m
    })
  }, [parts])

  // Per-instance breath phase (stable, seeded by id) so animals don't
  // breathe in lock-step.
  const breathPhases = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      arr[i] = (((ids[i] * 9301 + 49297) % 1000) / 1000) * Math.PI * 2
    }
    return arr
  }, [ids, count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (let i = 0; i < count; i++) {
      const id = ids[i]
      const [tx, ty] = getAnimalXY(id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const yaw = getAnimalHeading(id)

      const moving = Math.min(1, getAnimalSpeed(id) / 0.5)
      const gait = Math.sin(t * 9 + breathPhases[i]) * moving
      const breath = 1 + Math.sin(t * 2.4 + breathPhases[i]) * 0.035

      // Root: T(world) · Ry(yaw) · S(1, breath, 1)
      scratchVec.set(
        tx * TILE_SCALE,
        kind === 'fish'
          ? Math.min(-0.9, Math.max(groundY + 0.3, -1.1))
          : groundY + (kind === 'rabbit' ? Math.max(0, gait) * 0.14 : 0),
        ty * TILE_SCALE,
      )
      scratchEuler.set(0, yaw, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchScale.set(1, breath, 1)
      rootMat.compose(scratchVec, scratchQuat, scratchScale)

      for (let p = 0; p < parts.length; p++) {
        const im = meshes.current[p]
        if (!im) continue
        partMat.copy(partLocalMats[p])
        const part = parts[p]
        const wing = kind === 'bird' && (p === 1 || p === 2)
        const leg = quadruped && p >= 1 && p <= 4
        if (wing || leg) {
          const swing = wing ? Math.sin(t * 12 + breathPhases[i]) * 0.55 : gait * 0.35
          const sign = wing ? (p === 1 ? 1 : -1) : p === 1 || p === 4 ? 1 : -1
          scratchEuler.set(
            part.rot[0] + (leg ? swing * sign : 0),
            part.rot[1],
            part.rot[2] + (wing ? swing * sign : 0),
          )
          scratchQuat.setFromEuler(scratchEuler)
          scratchVec.set(...part.offset)
          scratchScale.set(1, 1, 1)
          partMat.compose(scratchVec, scratchQuat, scratchScale)
        }
        finalMat.multiplyMatrices(rootMat, partMat)
        im.setMatrixAt(i, finalMat)
      }
    }
    for (let p = 0; p < parts.length; p++) {
      const im = meshes.current[p]
      if (im) im.instanceMatrix.needsUpdate = true
    }
  })

  if (count === 0) return null

  return (
    <>
      {parts.map((part, p) => (
        <instancedMesh
          // Key includes count so React recreates when capacity changes
          // (InstancedMesh capacity is fixed after construction).
          key={`${kind}-${p}-${count}`}
          ref={(m) => {
            meshes.current[p] = m
          }}
          args={[geometries[p], undefined, count]}
          castShadow
          frustumCulled={false}
        >
          <meshStandardMaterial color={part.color} roughness={0.9} flatShading />
        </instancedMesh>
      ))}
    </>
  )
}

export function Animals3D({ animals, depthMap, biomes }: Props) {
  // Group ids by kind. Stable order: source array order. We memoise
  // shallowly via animals identity - the wire merge layer keeps the
  // animals array stable across ticks when nothing changes.
  const byKind = useMemo(() => {
    const m = new Map<AnimalState['kind'], number[]>()
    for (const a of animals) {
      const arr = m.get(a.kind) ?? []
      if (arr.length === 0) m.set(a.kind, arr)
      arr.push(a.id)
    }
    return m
  }, [animals])

  if (!depthMap || !biomes) return null

  return (
    <>
      {Array.from(byKind.entries()).map(([kind, ids]) => {
        return (
          <InstancedSpecies
            key={`species-${kind}`}
            kind={kind}
            ids={ids}
            depthMap={depthMap}
            biomes={biomes}
          />
        )
      })}
    </>
  )
}
