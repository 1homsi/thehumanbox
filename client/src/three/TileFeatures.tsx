import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, OctahedronGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three'
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
  tiles:     number[][]
  biomes:    number[][]
  depthMap:  number[][]
  width:     number
  height:    number
  pathTrail?: number[][]
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
  width: number, height: number, pathTrail?: number[][],
) {
  const trees: { 0: [number, number, number, number][]; 1: typeof trees[0]; 2: typeof trees[0] } = {
    0: [], 1: [], 2: [],
  }
  const huts:        [number, number, number][] = []
  const campfires:   [number, number, number][] = []
  const fires:       [number, number, number][] = []
  const rocks:       [number, number, number][] = []
  const minerals:    [number, number, number][] = []
  const fence_posts: [number, number, number][] = []
  const wells:       [number, number, number][] = []
  const paths:       [number, number, number][] = []
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

  // Fence posts around each hut (8 posts per hut)
  const FENCE_R = 3.0
  for (const [hx, hy, hz] of huts) {
    fence_posts.push(
      [hx - FENCE_R, hy, hz - FENCE_R],
      [hx,           hy, hz - FENCE_R],
      [hx + FENCE_R, hy, hz - FENCE_R],
      [hx + FENCE_R, hy, hz          ],
      [hx + FENCE_R, hy, hz + FENCE_R],
      [hx,           hy, hz + FENCE_R],
      [hx - FENCE_R, hy, hz + FENCE_R],
      [hx - FENCE_R, hy, hz          ],
    )
  }

  // Wells: one per cluster of nearby huts (>= 2 huts within 20 world units)
  const usedForWell = new Set<number>()
  for (let i = 0; i < huts.length; i++) {
    if (usedForWell.has(i)) continue
    const [hx, hy, hz] = huts[i]
    const cluster = [i]
    for (let j = i + 1; j < huts.length; j++) {
      if (usedForWell.has(j)) continue
      const dx = hx - huts[j][0]; const dz = hz - huts[j][2]
      if (dx * dx + dz * dz < 400) cluster.push(j) // within 20 world units
    }
    if (cluster.length >= 2) {
      const cx = cluster.reduce((s, k) => s + huts[k][0], 0) / cluster.length
      const cz = cluster.reduce((s, k) => s + huts[k][2], 0) / cluster.length
      wells.push([cx, hy, cz])
      cluster.forEach(k => usedForWell.add(k))
    } else {
      usedForWell.add(i)
    }
  }

  // Path tiles from path trail data
  if (pathTrail) {
    for (let y = 0; y < height; y++) {
      const pRow = pathTrail[y]; const dRow = depthMap[y]
      if (!pRow || !dRow) continue
      for (let x = 0; x < width; x++) {
        if ((pRow[x] ?? 0) < 0.6) continue
        if ((dRow[x] ?? 255) < 254) continue
        const ground = heightAt(x, y, depthMap, biomes)
        paths.push([x * TILE_SCALE, ground, y * TILE_SCALE])
      }
    }
  }

  // Reeds and lily pads at shallow water edges (lakes, ponds, wetlands)
  const reeds:     [number, number, number, number][] = []
  const lily_pads: [number, number, number, number][] = []
  for (let y = 0; y < height; y++) {
    const dRow = depthMap[y]
    if (!dRow) continue
    for (let x = 0; x < width; x++) {
      const d = dRow[x] ?? 255
      if (d >= 254 || d < 180) continue // only shallow water (d 180-253)
      // Must be adjacent to a land tile
      let nearLand = false
      for (const [dy2, dx2] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const ny = y + dy2; const nx = x + dx2
        if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
        if ((depthMap[ny]?.[nx] ?? 255) >= 254) { nearLand = true; break }
      }
      if (!nearLand) continue
      let hash = (x * 73856093) ^ (y * 19349663)
      hash = ((hash ^ (hash >>> 13)) * 0x5bd1e995) >>> 0
      const r0 = (hash & 0xff) / 255
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      if (r0 < 0.30) {
        const jx = (r1 - 0.5) * TILE_SCALE * 0.5
        const jz = (r2 - 0.5) * TILE_SCALE * 0.5
        reeds.push([x * TILE_SCALE + jx, 0.0, y * TILE_SCALE + jz, hash])
      }
      if (r2 < 0.12) {
        lily_pads.push([x * TILE_SCALE, 0.06, y * TILE_SCALE, hash])
      }
    }
  }

  // Town halls: one large landmark per cluster of 5+ huts
  const town_halls: [number, number, number][] = []
  const usedForTH = new Set<number>()
  for (let i = 0; i < huts.length; i++) {
    if (usedForTH.has(i)) continue
    const [hx, hy, hz] = huts[i]
    const cluster = [i]
    for (let j = i + 1; j < huts.length; j++) {
      if (usedForTH.has(j)) continue
      const ddx = hx - huts[j][0]; const ddz = hz - huts[j][2]
      if (ddx * ddx + ddz * ddz < 1764) cluster.push(j) // within 42 world units
    }
    if (cluster.length >= 5) {
      const cx = cluster.reduce((s, k) => s + huts[k][0], 0) / cluster.length
      const cz = cluster.reduce((s, k) => s + huts[k][2], 0) / cluster.length
      town_halls.push([cx, hy, cz])
      cluster.forEach(k => usedForTH.add(k))
    }
  }

  // Market stalls: one per campfire, offset to the side
  const stall_awnings:  [number, number, number][] = []
  const stall_posts:    [number, number, number][] = []
  for (let i = 0; i < campfires.length; i++) {
    const [cx, cy, cz] = campfires[i]
    const angle = ((i * 137) % 360) * (Math.PI / 180)
    const dist = 4.8
    const sx = cx + Math.cos(angle) * dist
    const sz = cz + Math.sin(angle) * dist
    stall_awnings.push([sx, cy, sz])
    stall_posts.push(
      [sx - 1.4, cy, sz - 0.95],
      [sx + 1.4, cy, sz - 0.95],
      [sx - 1.4, cy, sz + 0.95],
      [sx + 1.4, cy, sz + 0.95],
    )
  }

  return {
    trees, huts, campfires, fires, rocks, minerals,
    fence_posts, wells, paths, reeds, lily_pads,
    town_halls, stall_awnings, stall_posts, volcanic_peaks,
  }
}

const PINE_TRUNK   = new CylinderGeometry(0.16, 0.22, 1.4, 5)
const PINE_CANOPY  = new ConeGeometry(1.4, 3.2, 6)
const OAK_TRUNK    = new CylinderGeometry(0.20, 0.28, 1.6, 6)
const OAK_CANOPY   = new SphereGeometry(1.3, 6, 5)
const PALM_TRUNK   = new CylinderGeometry(0.12, 0.16, 2.6, 5)
const PALM_FRONDS  = new ConeGeometry(1.6, 0.6, 6)
// Huts made substantially larger so they look like real dwellings
const HUT_WALLS    = new BoxGeometry(4.2, 3.0, 4.2)
const HUT_ROOF     = (() => {
  const g = new ConeGeometry(3.2, 2.4, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const HUT_DOOR     = new BoxGeometry(0.85, 1.70, 0.12)
const HUT_CHIMNEY  = new CylinderGeometry(0.20, 0.22, 0.8, 6)
// Fence posts around hut perimeters
const FENCE_POST   = new CylinderGeometry(0.10, 0.13, 1.5, 5)
// Well: stone drum + torus ring + roof cone
const WELL_DRUM    = new CylinderGeometry(0.50, 0.55, 0.90, 10)
const WELL_LIP     = new TorusGeometry(0.52, 0.10, 5, 12)
const WELL_POLE    = new CylinderGeometry(0.07, 0.07, 1.60, 4)
const WELL_ROOF    = (() => {
  const g = new ConeGeometry(0.72, 0.55, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
// Worn path: flat plane per tile
const PATH_GEO     = (() => {
  const g = new PlaneGeometry(TILE_SCALE * 0.9, TILE_SCALE * 0.9)
  g.rotateX(-Math.PI / 2)
  return g
})()
const CAMP_DISC    = new CylinderGeometry(0.85, 0.85, 0.12, 10)
const CAMP_FLAME   = new ConeGeometry(0.5, 1.2, 6)
const CAMP_LOG     = new CylinderGeometry(0.12, 0.12, 1.0, 5)
const FIRE_INNER   = new ConeGeometry(0.5, 1.4, 6)
const FIRE_OUTER   = new ConeGeometry(0.75, 2.0, 6)
const ROCK_GEO     = new DodecahedronGeometry(0.7, 0)
const MINERAL_GEO  = new OctahedronGeometry(0.6, 0)
// Lake / wetland decorations
const REED_STEM    = new CylinderGeometry(0.045, 0.07, 1.55, 4)
const REED_HEAD    = new CylinderGeometry(0.13, 0.06, 0.55, 5)
const LILY_PAD     = (() => {
  const g = new CircleGeometry(0.50, 8)
  g.rotateX(-Math.PI / 2)
  return g
})()
// Town hall – central landmark for large settlements
const TOWN_HALL_WALLS  = new BoxGeometry(7.5, 5.2, 7.5)
const TOWN_HALL_ROOF   = (() => {
  const g = new ConeGeometry(5.8, 4.0, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const TOWN_HALL_TOWER  = new CylinderGeometry(1.2, 1.3, 9.5, 8)
const TOWN_HALL_CAP    = new ConeGeometry(1.6, 2.5, 8)
// Market stalls near campfires
const STALL_AWNING     = new BoxGeometry(3.2, 0.14, 2.4)
const STALL_POST       = new CylinderGeometry(0.09, 0.11, 1.9, 4)

const tmp = new Object3D()

// Pooled, shared MeshStandardMaterials keyed by their visual config.
// Previously each InstanceLayer instance allocated its own material - with ~28
// layers in the scene that meant ~28 distinct GPU programs/uniform blocks for
// what is effectively a small palette of colors. These are intentionally never
// disposed: their lifetime matches the module (process lifetime), and they are
// re-used across re-renders and across all InstanceLayer mounts.
const PLAIN_MATERIAL_POOL  = new Map<string, MeshStandardMaterial>()
const WIND_MATERIAL_POOL   = new Map<string, MeshStandardMaterial>()

function getPlainMaterial(color: string): MeshStandardMaterial {
  let m = PLAIN_MATERIAL_POOL.get(color)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85 })
    PLAIN_MATERIAL_POOL.set(color, m)
  }
  return m
}

function getWindMaterial(
  color: string, heightRef: number, strength: number,
): MeshStandardMaterial {
  const key = `${color}|${heightRef}|${strength}`
  let m = WIND_MATERIAL_POOL.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85 })
    m.emissive = new Color(color)
    m.emissiveIntensity = 0.12
    applyWindSway(m, heightRef, strength)
    WIND_MATERIAL_POOL.set(key, m)
  }
  return m
}

interface InstanceProps {
  positions: [number, number, number, number?][]
  yOffset:   number
  geometry:  BufferGeometry
  color:     string
  maxCount:  number
  scale?:    number
  randomYaw?: boolean
  wind?:     { heightRef: number; strength?: number }
}

function InstanceLayer({
  positions, yOffset, geometry, color, maxCount, scale = 1, randomYaw = false, wind,
}: InstanceProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

  const material = wind
    ? getWindMaterial(color, wind.heightRef, wind.strength ?? 1.0)
    : getPlainMaterial(color)

  // Populate the InstancedMesh matrix buffer after mount, when meshRef.current
  // is guaranteed non-null. useMemo on `meshRef.current` is unreliable (the ref
  // is null on the first render pass), so we use useLayoutEffect with the same
  // logical dependencies.
  useLayoutEffect(() => {
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
  const meshRef = useRef<InstancedMesh>(null)
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

const SMOKE_GEO = new PlaneGeometry(1, 1)
const SMOKE_PER_FIRE = 6
const SMOKE_WRAP_H = 10

function FireSmoke({
  positions, maxCount, intensity = 1.0,
}: { positions: [number, number, number][]; maxCount: number; intensity?: number }) {
  const meshRef = useRef<InstancedMesh>(null)
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

const SPARK_GEO = new SphereGeometry(0.06, 4, 3)
const SPARKS_PER_FIRE = 10
const SPARK_LIFE = 1.2

function FireSparks({
  positions, maxCount,
}: { positions: [number, number, number][]; maxCount: number }) {
  const meshRef = useRef<InstancedMesh>(null)
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
  const meshRef = useRef<InstancedMesh>(null)
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

export function TileFeatures({ tiles, biomes, depthMap, width, height, pathTrail }: Props) {
  const features = useMemo(
    () => collectFeatures(tiles, biomes, depthMap, width, height, pathTrail),
    [tiles, biomes, depthMap, width, height, pathTrail],
  )

  const treeYAdjust = 0.7
  // Hut geometry yOffsets recalculated for 3.0-tall walls:
  // walls: center at half-height = 1.5 above ground
  // roof: top-of-walls (3.0) + half-cone-height (1.2) = 4.2
  // door: at front face z+2.1, vertically centered at 0.85 (half of 1.70)
  // chimney: roof apex ~ ground+4.2, chimney center slightly above

  return (
    <>
      <TreeWindController />

      {/* Pine trees */}
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

      {/* Oak trees */}
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

      {/* Palm trees */}
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

      {/* Worn paths */}
      <InstanceLayer
        positions={features.paths} yOffset={0.015}
        geometry={PATH_GEO} color="#6b5438"
        maxCount={8000}
      />

      {/* Hut walls */}
      <InstanceLayer
        positions={features.huts} yOffset={1.5}
        geometry={HUT_WALLS} color="#9a7a50"
        maxCount={500}
      />
      {/* Hut roof */}
      <InstanceLayer
        positions={features.huts} yOffset={4.2}
        geometry={HUT_ROOF} color="#4a2a18"
        maxCount={500}
      />
      {/* Hut door – front face at z + 2.1 */}
      <InstanceLayer
        positions={features.huts.map(p => [p[0], p[1], p[2] + 2.1] as [number, number, number, number?])}
        yOffset={0.85}
        geometry={HUT_DOOR} color="#2a1408"
        maxCount={500}
      />
      {/* Hut chimney – sits near roof peak */}
      <InstanceLayer
        positions={features.huts.map(p => [p[0] - 0.8, p[1], p[2] - 0.8] as [number, number, number, number?])}
        yOffset={4.6}
        geometry={HUT_CHIMNEY} color="#3a2a1a"
        maxCount={500}
      />

      {/* Fence posts around huts */}
      <InstanceLayer
        positions={features.fence_posts} yOffset={0.75}
        geometry={FENCE_POST} color="#5a3a1a"
        maxCount={4000}
      />

      {/* Wells: drum + lip + pole + roof */}
      <InstanceLayer
        positions={features.wells} yOffset={0.45}
        geometry={WELL_DRUM} color="#8a8070"
        maxCount={200}
      />
      <InstanceLayer
        positions={features.wells} yOffset={0.95}
        geometry={WELL_LIP} color="#7a7060"
        maxCount={200}
      />
      <InstanceLayer
        positions={features.wells} yOffset={1.70}
        geometry={WELL_POLE} color="#4a3020"
        maxCount={200}
      />
      <InstanceLayer
        positions={features.wells} yOffset={2.65}
        geometry={WELL_ROOF} color="#4a2a18"
        maxCount={200}
      />

      <InstanceLayer
        positions={features.campfires} yOffset={0.06}
        geometry={CAMP_DISC} color="#1a0f06"
        maxCount={300}
      />
      <InstanceLayer
        positions={features.campfires} yOffset={0.18}
        geometry={CAMP_LOG} color="#4a2e1a"
        maxCount={300}
        randomYaw
      />
      <CampfireFlames positions={features.campfires} maxCount={300} />
      <FireSmoke positions={features.campfires} maxCount={300} intensity={0.7} />

      {/* Open fires */}
      <InstanceLayer
        positions={features.fires} yOffset={1.0}
        geometry={FIRE_OUTER} color="#ff7820"
        maxCount={500} scale={1.4}
      />
      <FireGlow positions={features.fires} maxCount={500} />
      <FireSmoke positions={features.fires} maxCount={500} intensity={1.4} />
      <FireSparks positions={features.fires} maxCount={500} />

      {/* Chimney smoke from occupied huts */}
      <FireSmoke
        positions={features.huts.map(([px, py, pz]) =>
          [px - 0.8, py + 4.8, pz - 0.8] as [number, number, number]
        )}
        maxCount={500}
        intensity={0.28}
      />

      {/* Volcanic effects */}
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

      {/* Lake / wetland reeds at shallow water edges */}
      <InstanceLayer
        positions={features.reeds} yOffset={0.78}
        geometry={REED_STEM} color="#5a7a3a"
        maxCount={3000} randomYaw
      />
      <InstanceLayer
        positions={features.reeds} yOffset={1.83}
        geometry={REED_HEAD} color="#7a5a2a"
        maxCount={3000} randomYaw
      />

      {/* Lily pads on water surface */}
      <InstanceLayer
        positions={features.lily_pads} yOffset={0.0}
        geometry={LILY_PAD} color="#3a6a2a"
        maxCount={1000} randomYaw
      />

      {/* Town hall – only appears when 5+ huts cluster together */}
      <InstanceLayer
        positions={features.town_halls} yOffset={2.6}
        geometry={TOWN_HALL_WALLS} color="#c8b890"
        maxCount={10}
      />
      <InstanceLayer
        positions={features.town_halls} yOffset={7.2}
        geometry={TOWN_HALL_ROOF} color="#5a3222"
        maxCount={10}
      />
      {/* Central tower offset to front of town hall */}
      <InstanceLayer
        positions={features.town_halls.map(([x,y,z]) => [x, y, z + 3.0] as [number,number,number,number?])}
        yOffset={4.75}
        geometry={TOWN_HALL_TOWER} color="#b0a080"
        maxCount={10}
      />
      <InstanceLayer
        positions={features.town_halls.map(([x,y,z]) => [x, y, z + 3.0] as [number,number,number,number?])}
        yOffset={10.45}
        geometry={TOWN_HALL_CAP} color="#5a3222"
        maxCount={10}
      />

      {/* Market stalls near campfires */}
      <InstanceLayer
        positions={features.stall_awnings} yOffset={2.0}
        geometry={STALL_AWNING} color="#c88030"
        maxCount={200}
      />
      <InstanceLayer
        positions={features.stall_posts} yOffset={0.95}
        geometry={STALL_POST} color="#5a3a1a"
        maxCount={800}
      />
    </>
  )
}
