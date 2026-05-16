import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

// Tile enum (from simulation/world/tiles.rs):
const T_GRASS    = 1
const T_FOOD     = 3
const T_FIRE     = 4
const T_ROCK     = 5
const T_CAMPFIRE = 7
const T_HUT      = 8
const T_MINERAL  = 10
// Biome enum (correct, matches rust):
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

// Per-biome tree density (chance per tile) + min spacing (tiles).
// Mirrors the 2D drawTrees() poisson-disc placement so the 3D forest
// reads the same as the 2D map - was the user's #1 complaint.
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

// Pick the tree species for a biome. Each species has its own
// geometry pair (trunk + canopy) below; the caller picks 0 / 1 / 2
// based on biome hint.
function treeSpecies(b: number, hash: number): 0 | 1 | 2 {
  // 0 = pine (tall cone, dark green) - dominant in forest/tundra
  // 1 = oak  (sphere canopy, mid green) - grass/wetland
  // 2 = palm (slim trunk, broad top) - desert/grass
  if (b === B_FOREST || b === B_TUNDRA) return (hash & 0x3) === 0 ? 1 : 0
  if (b === B_DESERT) return 2
  if (b === B_WETLAND) return (hash & 0x1) ? 1 : 0
  // grassland: mix
  const r = hash & 0x7
  if (r < 4) return 1
  if (r < 6) return 0
  return 2
}

function collectFeatures(
  tiles: number[][], biomes: number[][], depthMap: number[][],
  width: number, height: number,
) {
  // Trees split by species so each instanced layer is uniform.
  const trees: { 0: [number, number, number, number][]; 1: typeof trees[0]; 2: typeof trees[0] } = {
    0: [], 1: [], 2: [],
  }
  const huts:      [number, number, number][] = []
  const campfires: [number, number, number][] = []
  const fires:     [number, number, number][] = []
  const rocks:     [number, number, number][] = []
  const minerals:  [number, number, number][] = []

  // placed[i] = 1 means a tree exists at (x, y) - used for the
  // spacing reject test below.
  const placed = new Uint8Array(width * height)

  // Hash-shuffle tile order so nearby tiles aren't always winning the
  // chance roll - this avoids visible "stripes" of trees.
  const order: number[] = new Array(width * height)
  for (let i = 0; i < order.length; i++) order[i] = i
  for (let i = order.length - 1; i > 0; i--) {
    const r = (i * 2654435761) >>> 0
    const j = r % (i + 1)
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp
  }

  // Non-tree features (rocks/huts/etc) - separate pass over the grid
  // since they're keyed on the tile enum, not biome density.
  for (let y = 0; y < height; y++) {
    const tRow = tiles[y]
    const dRow = depthMap[y]
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
    }
  }

  // Tree pass with poisson-disc rejection.
  for (const idx of order) {
    const x = idx % width
    const y = (idx - x) / width
    const tRow = tiles[y]; const bRow = biomes[y]; const dRow = depthMap[y]
    if (!tRow || !bRow || !dRow) continue
    const t = tRow[x]
    if (t !== T_GRASS && t !== T_FOOD) continue   // trees only on grass/food
    const d = dRow[x] ?? 255
    if (d < 254) continue                          // skip underwater
    const b = bRow[x] ?? 0
    const rule = biomeTreeRule(b)
    if (rule.chance <= 0) continue

    // Per-tile stable hash for chance + species.
    let hash = (x * 73856093) ^ (y * 19349663)
    hash = ((hash ^ (hash >>> 13)) * 0x5bd1e995) >>> 0
    const r0 = (hash & 0xff) / 255
    if (r0 >= rule.chance) continue

    // Reject if any tree already sits within spacing tiles.
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

  return { trees, huts, campfires, fires, rocks, minerals }
}

// ── Shared geometry pool ────────────────────────────────────────────────
// Pine: trunk + tall cone canopy
const PINE_TRUNK   = new THREE.CylinderGeometry(0.16, 0.22, 1.4, 5)
const PINE_CANOPY  = new THREE.ConeGeometry(1.4, 3.2, 6)
// Oak: trunk + sphere canopy
const OAK_TRUNK    = new THREE.CylinderGeometry(0.20, 0.28, 1.6, 6)
const OAK_CANOPY   = new THREE.SphereGeometry(1.3, 6, 5)
// Palm: thin trunk + low cone "fronds"
const PALM_TRUNK   = new THREE.CylinderGeometry(0.12, 0.16, 2.6, 5)
const PALM_FRONDS  = new THREE.ConeGeometry(1.6, 0.6, 6)
// Buildings + structures
const HUT_WALLS    = new THREE.BoxGeometry(2.0, 1.6, 2.0)
const HUT_ROOF     = new THREE.ConeGeometry(1.7, 1.3, 4)
const CAMP_DISC    = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8)
const CAMP_FLAME   = new THREE.ConeGeometry(0.45, 1.0, 6)
const ROCK_GEO     = new THREE.DodecahedronGeometry(0.65, 0)
const MINERAL_GEO  = new THREE.OctahedronGeometry(0.55, 0)

const tmp = new THREE.Object3D()

interface InstanceProps {
  positions: [number, number, number, number?][]
  yOffset:   number
  geometry:  THREE.BufferGeometry
  color:     string
  maxCount:  number
  scale?:    number
  randomYaw?: boolean
}

function InstanceLayer({
  positions, yOffset, geometry, color, maxCount, scale = 1, randomYaw = false,
}: InstanceProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

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
      args={[geometry, undefined, maxCount]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial color={color} roughness={0.85} />
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

  // Hut bodies sit half-buried so the wall base aligns with terrain.
  // The roof rides on top of the walls. Each is its own draw call but
  // both layers share the same per-hut positions.
  const treeYAdjust = 0.7  // trunk centre is 0.7 above ground for pine/oak

  return (
    <>
      {/* Pines (forest/tundra dominant) */}
      <InstanceLayer
        positions={features.trees[0]} yOffset={treeYAdjust}
        geometry={PINE_TRUNK} color="#5a3f25"
        maxCount={20000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[0]} yOffset={treeYAdjust + 2.0}
        geometry={PINE_CANOPY} color="#264f25"
        maxCount={20000} randomYaw
      />

      {/* Oaks (grass/wetland dominant) */}
      <InstanceLayer
        positions={features.trees[1]} yOffset={0.8}
        geometry={OAK_TRUNK} color="#6a4a2c"
        maxCount={15000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[1]} yOffset={2.3}
        geometry={OAK_CANOPY} color="#37753c"
        maxCount={15000} randomYaw
      />

      {/* Palms (desert + grass mix) */}
      <InstanceLayer
        positions={features.trees[2]} yOffset={1.3}
        geometry={PALM_TRUNK} color="#7a5a2e"
        maxCount={4000} randomYaw
      />
      <InstanceLayer
        positions={features.trees[2]} yOffset={2.8}
        geometry={PALM_FRONDS} color="#4a8f3a"
        maxCount={4000} randomYaw
      />

      <InstanceLayer
        positions={features.huts} yOffset={0.8}
        geometry={HUT_WALLS} color="#8a6a40"
        maxCount={500}
      />
      <InstanceLayer
        positions={features.huts} yOffset={2.2}
        geometry={HUT_ROOF} color="#5a3520"
        maxCount={500}
      />

      <InstanceLayer
        positions={features.campfires} yOffset={0.05}
        geometry={CAMP_DISC} color="#3a2418"
        maxCount={300}
      />
      <CampfireFlames positions={features.campfires} maxCount={300} />

      <InstanceLayer
        positions={features.fires} yOffset={0.6}
        geometry={CAMP_FLAME} color="#ff5028"
        maxCount={500} scale={1.6}
      />

      <InstanceLayer
        positions={features.rocks} yOffset={0.3}
        geometry={ROCK_GEO} color="#7a7a7a"
        maxCount={4000} randomYaw
      />

      <InstanceLayer
        positions={features.minerals} yOffset={0.3}
        geometry={MINERAL_GEO} color="#a8b8d8"
        maxCount={1000} randomYaw
      />
    </>
  )
}
