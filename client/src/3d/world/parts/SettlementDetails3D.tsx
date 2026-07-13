import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[]
  depthMap: number[][]
  biomes: number[][]
  dayProgress: number
}

interface PropInstance {
  x: number
  y: number
  z: number
  yaw: number
  scale: number
}

interface PropSet {
  barrels: PropInstance[]
  crates: PropInstance[]
  benches: PropInstance[]
  lanterns: PropInstance[]
  laundry: PropInstance[]
}

const scratch = new Object3D()
const matrix = new Matrix4()

function hash01(value: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts) ?? parts[0]
}

const BARREL = (() => {
  const body = new CylinderGeometry(0.32, 0.32, 0.7, 10)
  body.translate(0, 0.35, 0)
  const top = new CylinderGeometry(0.34, 0.34, 0.06, 10)
  top.translate(0, 0.7, 0)
  const bottom = top.clone()
  bottom.translate(0, -0.68, 0)
  return merged([body, top, bottom])
})()

const CRATE = (() => {
  const box = new BoxGeometry(0.72, 0.65, 0.72)
  box.translate(0, 0.325, 0)
  const slatA = new BoxGeometry(0.78, 0.08, 0.08)
  slatA.translate(0, 0.34, 0.39)
  const slatB = slatA.clone()
  slatB.rotateZ(Math.PI / 2)
  return merged([box, slatA, slatB])
})()

const BENCH = (() => {
  const seat = new BoxGeometry(1.55, 0.14, 0.48)
  seat.translate(0, 0.52, 0)
  const back = new BoxGeometry(1.55, 0.48, 0.12)
  back.translate(0, 0.79, -0.23)
  const legA = new BoxGeometry(0.13, 0.52, 0.38)
  legA.translate(-0.57, 0.26, 0)
  const legB = legA.clone()
  legB.translate(1.14, 0, 0)
  return merged([seat, back, legA, legB])
})()

const LANTERN = (() => {
  const post = new CylinderGeometry(0.06, 0.075, 2.25, 7)
  post.translate(0, 1.125, 0)
  const cap = new SphereGeometry(0.19, 7, 6)
  cap.translate(0, 2.13, 0)
  return merged([post, cap])
})()

const LAUNDRY = (() => {
  const parts: BufferGeometry[] = []
  for (const x of [-1.15, 1.15]) {
    const post = new CylinderGeometry(0.045, 0.06, 1.7, 6)
    post.translate(x, 0.85, 0)
    parts.push(post)
  }
  const line = new CylinderGeometry(0.018, 0.018, 2.3, 5)
  line.rotateZ(Math.PI / 2)
  line.translate(0, 1.58, 0)
  parts.push(line)
  for (const [x, drop] of [
    [-0.62, 0.27],
    [0, 0.35],
    [0.65, 0.24],
  ] as Array<[number, number]>) {
    const cloth = new BoxGeometry(0.45, drop, 0.035)
    cloth.translate(x, 1.58 - drop / 2, 0)
    parts.push(cloth)
  }
  return merged(parts)
})()

function InstancedProps({
  geometry,
  material,
  instances,
}: {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  instances: PropInstance[]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < instances.length; i++) {
      const p = instances[i]
      scratch.position.set(p.x, p.y, p.z)
      scratch.rotation.set(0, p.yaw, 0)
      scratch.scale.setScalar(p.scale)
      scratch.updateMatrix()
      matrix.copy(scratch.matrix)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])
  if (instances.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, material, instances.length]} castShadow receiveShadow />
}

export function SettlementDetails3D({ buildings, depthMap, biomes, dayProgress }: Props) {
  const props = useMemo<PropSet>(() => {
    const result: PropSet = { barrels: [], crates: [], benches: [], lanterns: [], laundry: [] }
    const limited = buildings.slice(0, 220)
    for (let i = 0; i < limited.length; i++) {
      const b = limited[i]
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue
      const key = `${b.kind}:${b.x}:${b.y}:${i}`
      const angle = hash01(key, 1) * Math.PI * 2
      const footprint = b.footprint ?? [2, 2]
      const radius = (Math.max(footprint[0], footprint[1]) * 0.5 + 0.7) * TILE_SCALE
      const x = b.x * TILE_SCALE + Math.cos(angle) * radius
      const z = b.y * TILE_SCALE + Math.sin(angle) * radius
      const y = heightAt(x / TILE_SCALE, z / TILE_SCALE, depthMap, biomes) + 0.04
      const instance = { x, y, z, yaw: -angle + Math.PI / 2, scale: 0.85 + hash01(key, 2) * 0.3 }
      const kind = String(b.kind).toLowerCase()
      if (/house|hut|manor|apartment|town/.test(kind)) {
        if (hash01(key, 3) > 0.42) result.laundry.push(instance)
        else result.benches.push(instance)
      } else if (/market|tavern|inn|brew|bakery|forge|mill|factory|shop/.test(kind)) {
        result.barrels.push(instance)
        if (hash01(key, 4) > 0.48) {
          result.crates.push({
            ...instance,
            x: x + Math.cos(angle + 1.4) * 0.9,
            z: z + Math.sin(angle + 1.4) * 0.9,
            scale: 0.78,
          })
        }
      } else if (hash01(key, 5) > 0.64) {
        result.benches.push(instance)
      }
      if (i % 4 === 0 && !/farm|mine|quarry|wall|bridge/.test(kind)) {
        result.lanterns.push({
          ...instance,
          x: x + Math.cos(angle - 1.2) * 1.4,
          z: z + Math.sin(angle - 1.2) * 1.4,
          scale: 1,
        })
      }
    }
    return result
  }, [buildings, depthMap, biomes])

  const night = dayProgress < 0.22 || dayProgress > 0.78
  const materials = useMemo(
    () => ({
      barrel: new MeshStandardMaterial({ color: '#624126', roughness: 0.9 }),
      crate: new MeshStandardMaterial({ color: '#98704a', roughness: 0.95 }),
      bench: new MeshStandardMaterial({ color: '#75502e', roughness: 0.92 }),
      laundry: new MeshStandardMaterial({ color: '#d6b983', roughness: 0.9 }),
    }),
    [],
  )
  const lanternMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#59442d', emissive: '#ffad4a' }),
    [],
  )
  lanternMaterial.emissiveIntensity = night ? 1.4 : 0.05

  useEffect(
    () => () => {
      materials.barrel.dispose()
      materials.crate.dispose()
      materials.bench.dispose()
      materials.laundry.dispose()
      lanternMaterial.dispose()
    },
    [lanternMaterial, materials],
  )

  return (
    <group name="settlement-details">
      <InstancedProps geometry={BARREL} material={materials.barrel} instances={props.barrels} />
      <InstancedProps geometry={CRATE} material={materials.crate} instances={props.crates} />
      <InstancedProps geometry={BENCH} material={materials.bench} instances={props.benches} />
      <InstancedProps geometry={LAUNDRY} material={materials.laundry} instances={props.laundry} />
      <InstancedProps geometry={LANTERN} material={lanternMaterial} instances={props.lanterns} />
    </group>
  )
}
