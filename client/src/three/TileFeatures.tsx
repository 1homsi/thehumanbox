import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, BIOME_ELEVATION, BIOME_ROUGHNESS, terrainNoise } from './constants'
import { heightAt } from './terrain-utils'
import { applyWindSway, windUniforms } from './tree-wind'

function TreeWindController() {
  useFrame(({ clock }) => {
    windUniforms.uTime.value = clock.getElapsedTime()
  })
  return null
}

const T_GRASS    = 1
const T_FOOD     = 3
const T_FIRE     = 4
const T_ROCK     = 5
const T_CAMPFIRE = 7
const T_HUT      = 8
const T_MINERAL  = 10
const B_GRASS    = 0
const B_FOREST   = 1
const B_DESERT   = 2
const B_WETLAND  = 3
const B_TUNDRA   = 4
const B_VOLCANIC = 5

interface Props {
  tiles:    number[][]
  biomes:   number[][]
  depthMap: number[][]
  width:    number
  height:   number
}

function biomeTreeRule(b: number): { chance: number; spacing: number } {
  switch (b) {
    case B_FOREST:   return { chance: 0.32, spacing: 2 }
    case B_WETLAND:  return { chance: 0.18, spacing: 3 }
    case B_GRASS:    return { chance: 0.06, spacing: 5 }
    case B_TUNDRA:   return { chance: 0.10, spacing: 4 }
    case B_DESERT:   return { chance: 0.03, spacing: 6 }
    case B_VOLCANIC: return { chance: 0.05, spacing: 4 }
    default:         return { chance: 0.0,  spacing: 0 }
  }
}

function treeSpecies(b: number, hash: number): 0 | 1 | 2 {
  if (b === B_FOREST || b === B_TUNDRA) return (hash & 0x3) === 0 ? 1 : 0
  if (b === B_DESERT) return 2
  if (b === B_WETLAND) return (hash & 0x1) ? 1 : 0
  const r = hash & 0x7
  if (r < 4) return 1
  if (r < 6) return 0
  return 2
}

function collectFeatures(
  tiles: number[][], biomes: number[][], depthMap: number[][],
  width: number, height: number,
) {
  const trees: { 0: [number, number, number, number][]; 1: typeof trees[0]; 2: typeof trees[0] } = {
    0: [], 1: [], 2: [],
  }
  const huts:      [number, number, number][] = []
  const campfires: [number, number, number][] = []
  const fires:     [number, number, number][] = []
  const rocks:     [number, number, number][] = []
  const minerals:  [number, number, number][] = []
  const volcanic_peaks: [number, number, number][] = []

  const placed = new Uint8Array(width * height)

  const order: number[] = new Array(width * height)
  for (let i = 0; i < order.length; i++) order[i] = i
  for (let i = order.length - 1; i > 0; i--) {
    const r = (i * 2654435761) >>> 0
    const j = r % (i + 1)
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp
  }

  for (let y = 0; y < height; y++) {
    const tRow = tiles[y]
    const dRow = depthMap[y]
    const bRow = biomes[y]
    if (!tRow || !dRow) continue
    for (let x = 0; x < width; x++) {
      const t = tRow[x]
      if (t == null) continue
      const d = dRow[x] ?? 255
      if (d < 254) continue
      const ground = heightAt(x, y, depthMap, biomes)
      const px = x * TILE_SCALE
      const pz = y * TILE_SCALE
      if      (t === T_HUT)      huts.push([px, ground, pz])
      else if (t === T_CAMPFIRE) campfires.push([px, ground, pz])
      else if (t === T_FIRE)     fires.push([px, ground, pz])
      else if (t === T_ROCK)     rocks.push([px, ground, pz])
      else if (t === T_MINERAL)  minerals.push([px, ground, pz])

      const b = bRow?.[x] ?? 0
      if (b === 5 && (x % 3 === 0) && (y % 3 === 0)) {
        const base  = BIOME_ELEVATION[b] ?? 0
        const rough = BIOME_ROUGHNESS[b] ?? 0.5
        const elev  = base + terrainNoise(x, y) * rough
        if (elev > 7.0) {
          volcanic_peaks.push([px, ground + 0.4, pz])
        }
      }
    }
  }

  for (const idx of order) {
    const x = idx % width
    const y = (idx - x) / width
    const tRow = tiles[y]; const bRow = biomes[y]; const dRow = depthMap[y]
    if (!tRow || !bRow || !dRow) continue
    const t = tRow[x]
    if (t !== T_GRASS && t !== T_FOOD) continue
    const d = dRow[x] ?? 255
    if (d < 254) continue
    const b = bRow[x] ?? 0
    const rule = biomeTreeRule(b)
    if (rule.chance <= 0) continue

    let hash = (x * 73856093) ^ (y * 19349663)
    hash = ((hash ^ (hash >>> 13)) * 0x5bd1e995) >>> 0
    const r0 = (hash & 0xff) / 255
    if (r0 >= rule.chance) continue

    let reject = false
    for (let dy = -rule.spacing; dy <= rule.spacing && !reject; dy++) {
      for (let dx = -rule.spacing; dx <= rule.spacing && !reject; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (placed[ny * width + nx]) reject = true
      }
    }
    if (reject) continue

    placed[idx] = 1
    const ground = heightAt(x, y, depthMap, biomes)
    const px = x * TILE_SCALE
    const pz = y * TILE_SCALE
    const sp = treeSpecies(b, hash)
    trees[sp].push([px, ground, pz, hash])
  }

  return { trees, huts, campfires, fires, rocks, minerals, volcanic_peaks }
}

const PINE_TRUNK   = new THREE.CylinderGeometry(0.16, 0.22, 1.4, 5)
const PINE_CANOPY  = new THREE.ConeGeometry(1.4, 3.2, 6)
const OAK_TRUNK    = new THREE.CylinderGeometry(0.20, 0.28, 1.6, 6)
const OAK_CANOPY   = new THREE.SphereGeometry(1.3, 6, 5)
const PALM_TRUNK   = new THREE.CylinderGeometry(0.12, 0.16, 2.6, 5)
const PALM_FRONDS  = new THREE.ConeGeometry(1.6, 0.6, 6)
const HUT_WALLS    = new THREE.BoxGeometry(2.2, 1.8, 2.2)
const HUT_ROOF     = (() => {
  const g = new THREE.ConeGeometry(1.85, 1.5, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const HUT_DOOR     = new THREE.BoxGeometry(0.45, 0.95, 0.1)
const CAMP_DISC    = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10)
const CAMP_FLAME   = new THREE.ConeGeometry(0.5, 1.2, 6)
const CAMP_LOG     = new THREE.CylinderGeometry(0.12, 0.12, 1.0, 5)
const FIRE_INNER   = new THREE.ConeGeometry(0.5, 1.4, 6)
const FIRE_OUTER   = new THREE.ConeGeometry(0.75, 2.0, 6)
const ROCK_GEO     = new THREE.DodecahedronGeometry(0.7, 0)
const MINERAL_GEO  = new THREE.OctahedronGeometry(0.6, 0)

const tmp = new THREE.Object3D()

interface InstanceProps {
  positions: [number, number, number, number?][]
  yOffset:   number
  geometry:  THREE.BufferGeometry
  color:     string
  maxCount:  number
  scale?:    number
  randomYaw?: boolean
  wind?:     { heightRef: number; strength?: number }
}

function InstanceLayer({
  positions, yOffset, geometry, color, maxCount, scale = 1, randomYaw = false, wind,
}: InstanceProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    if (wind) {
      m.emissive = new THREE.Color(color)
      m.emissiveIntensity = 0.12
      applyWindSway(m, wind.heightRef, wind.strength ?? 1.0)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, wind?.heightRef, wind?.strength, !!wind])

  useMemo(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const seed = (i: number) => {
      let x = (i + 1) * 9301 + 49297
      x = (x * 9301 + 49297) % 233280
      return x / 233280
    }
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + yOffset, pz)
      tmp.rotation.set(0, randomYaw ? seed(i) * Math.PI * 2 : 0, 0)
      tmp.scale.setScalar(scale * (0.85 + seed(i + 100) * 0.3))
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, count, yOffset, scale, randomYaw])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxCount]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

function FireGlow({
  positions, maxCount,
}: { positions: [number, number, number][]; maxCount: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

  useMemo(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + 0.6, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(1.2)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, count])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      const phase = i * 0.37
      const s = 1.2 + Math.sin(t * 9 + phase) * 0.15 + Math.sin(t * 19 + phase) * 0.07
      tmp.position.set(px, py + 0.6, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(s, s + 0.15, s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[FIRE_INNER, undefined, maxCount]}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#ffd060" toneMapped={false} />
    </instancedMesh>
  )
}

const SMOKE_GEO = new THREE.PlaneGeometry(1, 1)
const SMOKE_PER_FIRE = 6
const SMOKE_WRAP_H = 10

function FireSmoke({
  positions, maxCount, intensity = 1.0,
}: { positions: [number, number, number][]; maxCount: number; intensity?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const total   = Math.min(positions.length, maxCount) * SMOKE_PER_FIRE

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh || total === 0) return
    const t = clock.getElapsedTime()
    const fireCount = Math.min(positions.length, maxCount)
    let inst = 0
    for (let f = 0; f < fireCount; f++) {
      const [px, py, pz] = positions[f]
      for (let p = 0; p < SMOKE_PER_FIRE; p++) {
        const phase = (f * 0.61 + p * 1.37) % 1
        const lifeRaw = (t * 1.4 + phase * SMOKE_WRAP_H) % SMOKE_WRAP_H
        const life = lifeRaw / SMOKE_WRAP_H
        const y = py + 0.8 + life * SMOKE_WRAP_H * 1.2
        const drift = life * 1.8
        const x = px + Math.cos(t * 0.4 + phase * 6) * drift
        const z = pz + Math.sin(t * 0.5 + phase * 4) * drift
        const scale = (0.4 + life * 1.6) * intensity
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
    <instancedMesh
      ref={meshRef}
      args={[SMOKE_GEO, undefined, total]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#aaaaaa"
        transparent
        opacity={0.32}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

const SPARK_GEO = new THREE.SphereGeometry(0.06, 4, 3)
const SPARKS_PER_FIRE = 10
const SPARK_LIFE = 1.2

function FireSparks({
  positions, maxCount,
}: { positions: [number, number, number][]; maxCount: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const fireCount = Math.min(positions.length, maxCount)
  const total     = fireCount * SPARKS_PER_FIRE

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || total === 0) return
    const t = clock.getElapsedTime()
    let inst = 0
    for (let f = 0; f < fireCount; f++) {
      const [px, py, pz] = positions[f]
      for (let p = 0; p < SPARKS_PER_FIRE; p++) {
        const phase = (f * 0.71 + p * 0.97) % 1
        const lifeRaw = (t + phase * SPARK_LIFE) % SPARK_LIFE
        const life = lifeRaw / SPARK_LIFE
        const dirSeed = ((f * 7919 + p * 6151) * 1664525) >>> 0
        const ang = (dirSeed & 0xffff) / 0xffff * Math.PI * 2
        const speed = 1.0 + ((dirSeed >>> 16) & 0xff) / 255 * 1.8
        const r = life * speed
        const x = px + Math.cos(ang) * r
        const z = pz + Math.sin(ang) * r
        const y = py + 0.9 + life * 3.0 - life * life * 1.5
        const scale = (1 - life) * 1.1
        tmp.position.set(x, y, z)
        tmp.rotation.set(0, 0, 0)
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
    <instancedMesh
      ref={meshRef}
      args={[SPARK_GEO, undefined, total]}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#ffb050" toneMapped={false} />
    </instancedMesh>
  )
}

function CampfireFlames({
  positions, maxCount,
}: { positions: [number, number, number][]; maxCount: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

  useMemo(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + 0.65, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, count])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    const s = 0.85 + Math.sin(t * 8) * 0.12 + Math.sin(t * 17) * 0.05
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + 0.65, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(s, s + 0.1, s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[CAMP_FLAME, undefined, maxCount]}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#ff9028" transparent opacity={0.92} />
    </instancedMesh>
  )
}

export function TileFeatures({ tiles, biomes, depthMap, width, height }: Props) {
  const features = useMemo(
    () => collectFeatures(tiles, biomes, depthMap, width, height),
    [tiles, biomes, depthMap, width, height],
  )

  const treeYAdjust = 0.7

  return (
    <>
      <TreeWindController />
      {}
      <InstanceLayer
        positions={features.trees[0]} yOffset={treeYAdjust}
        geometry={PINE_TRUNK} color="#5a3f25"
        maxCount={20000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[0]} yOffset={treeYAdjust + 2.0}
        geometry={PINE_CANOPY} color="#264f25"
        maxCount={20000} randomYaw
        wind={{ heightRef: 1.6, strength: 0.9 }}
      />

      {}
      <InstanceLayer
        positions={features.trees[1]} yOffset={0.8}
        geometry={OAK_TRUNK} color="#6a4a2c"
        maxCount={15000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[1]} yOffset={2.3}
        geometry={OAK_CANOPY} color="#37753c"
        maxCount={15000} randomYaw
        wind={{ heightRef: 1.3, strength: 1.1 }}
      />

      {}
      <InstanceLayer
        positions={features.trees[2]} yOffset={1.3}
        geometry={PALM_TRUNK} color="#7a5a2e"
        maxCount={4000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[2]} yOffset={2.8}
        geometry={PALM_FRONDS} color="#4a8f3a"
        maxCount={4000} randomYaw
        wind={{ heightRef: 0.3, strength: 1.4 }}
      />

      <InstanceLayer
        positions={features.huts} yOffset={0.9}
        geometry={HUT_WALLS} color="#8a6a40"
        maxCount={500}
      />
      <InstanceLayer
        positions={features.huts} yOffset={2.55}
        geometry={HUT_ROOF} color="#4a2a18"
        maxCount={500}
      />
      {}
      <InstanceLayer
        positions={features.huts.map(p => [p[0], p[1], p[2] + 1.1] as [number, number, number, number?])}
        yOffset={0.5}
        geometry={HUT_DOOR} color="#3a1f10"
        maxCount={500}
      />

      <InstanceLayer
        positions={features.campfires} yOffset={0.06}
        geometry={CAMP_DISC} color="#1a0f06"
        maxCount={300}
      />
      {}
      <InstanceLayer
        positions={features.campfires} yOffset={0.18}
        geometry={CAMP_LOG} color="#4a2e1a"
        maxCount={300}
        randomYaw
      />
      <CampfireFlames positions={features.campfires} maxCount={300} />
      <FireSmoke positions={features.campfires} maxCount={300} intensity={0.7} />

      {}
      <InstanceLayer
        positions={features.fires} yOffset={1.0}
        geometry={FIRE_OUTER} color="#ff7820"
        maxCount={500} scale={1.4}
      />
      <FireGlow positions={features.fires} maxCount={500} />
      <FireSmoke positions={features.fires} maxCount={500} intensity={1.4} />
      <FireSparks positions={features.fires} maxCount={500} />

      {}
      <FireSmoke
        positions={features.huts.map(([px, py, pz]) =>
          [px, py + 2.2, pz] as [number, number, number]
        )}
        maxCount={500}
        intensity={0.35}
      />

      {}
      <FireGlow positions={features.volcanic_peaks} maxCount={400} />
      <FireSparks positions={features.volcanic_peaks} maxCount={400} />

      <InstanceLayer
        positions={features.rocks} yOffset={0.35}
        geometry={ROCK_GEO} color="#6a6a6e"
        maxCount={4000} randomYaw
      />

      <InstanceLayer
        positions={features.minerals} yOffset={0.35}
        geometry={MINERAL_GEO} color="#a8b8d8"
        maxCount={1000} randomYaw
      />
    </>
  )
}
