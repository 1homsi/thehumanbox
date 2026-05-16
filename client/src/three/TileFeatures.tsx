import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, BIOME_ELEVATION } from './constants'

// Tile + biome enum IDs from simulation/world/tiles.rs:
const T_FOOD     = 3
const T_FIRE     = 4
const T_ROCK     = 5
const T_CAMPFIRE = 7
const T_HUT      = 8
const T_MINERAL  = 10
const B_FOREST   = 1

interface Props {
  tiles:    number[][]
  biomes:   number[][]
  depthMap: number[][]
  width:    number
  height:   number
}

// Single pre-pass over the tile grid pulls out positions for each
// feature type. O(W*H) once on mount; re-runs only if any of the
// dense layers change (which happens on cold-meta refresh from
// /snapshot, not per frame).
function collectFeatures(
  tiles: number[][], biomes: number[][], depthMap: number[][],
  width: number, height: number,
) {
  const trees:     [number, number, number][] = []
  const huts:      [number, number, number][] = []
  const campfires: [number, number, number][] = []
  const fires:     [number, number, number][] = []
  const rocks:     [number, number, number][] = []
  const minerals:  [number, number, number][] = []

  for (let y = 0; y < height; y++) {
    const tRow = tiles[y]
    const bRow = biomes[y]
    const dRow = depthMap[y]
    if (!tRow || !bRow || !dRow) continue
    for (let x = 0; x < width; x++) {
      const t = tRow[x]
      if (t == null) continue
      const d = dRow[x] ?? 255
      if (d < 254) continue  // skip underwater tiles
      const b = bRow[x] ?? 0
      const ground = BIOME_ELEVATION[b] ?? 0
      const px = x * TILE_SCALE
      const pz = y * TILE_SCALE
      // Trees: food tile on forest biome.
      if (t === T_FOOD && b === B_FOREST) {
        trees.push([px, ground, pz])
      } else if (t === T_HUT) {
        huts.push([px, ground, pz])
      } else if (t === T_CAMPFIRE) {
        campfires.push([px, ground, pz])
      } else if (t === T_FIRE) {
        fires.push([px, ground, pz])
      } else if (t === T_ROCK) {
        rocks.push([px, ground, pz])
      } else if (t === T_MINERAL) {
        minerals.push([px, ground, pz])
      }
    }
  }
  return { trees, huts, campfires, fires, rocks, minerals }
}

// ── Geometry pool (singletons, shared across renders) ───────────────────
const TRUNK_GEO    = new THREE.CylinderGeometry(0.18, 0.24, 1.4, 6)
const CANOPY_GEO   = new THREE.ConeGeometry(1.1, 2.4, 7)
const HUT_BODY     = new THREE.BoxGeometry(1.8, 1.4, 1.8)
const HUT_ROOF     = new THREE.ConeGeometry(1.4, 1.1, 4)
const CAMP_DISC    = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8)
const CAMP_FLAME   = new THREE.ConeGeometry(0.4, 0.9, 6)
const ROCK_GEO     = new THREE.DodecahedronGeometry(0.6, 0)
const MINERAL_GEO  = new THREE.OctahedronGeometry(0.5, 0)

const tmp = new THREE.Object3D()

interface InstanceLayerProps {
  positions: [number, number, number][]
  yOffset:   number
  geometry:  THREE.BufferGeometry
  color:     string
  maxCount:  number
  scale?:    number
  randomYaw?: boolean
}

function InstanceLayer({
  positions, yOffset, geometry, color, maxCount, scale = 1, randomYaw = false,
}: InstanceLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)

  useMemo(() => {
    const mesh = meshRef.current
    if (!mesh) return
    // Stable PRNG per index so the same tile gets the same yaw across
    // re-renders - prevents jitter when the data refreshes.
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
    >
      <meshStandardMaterial color={color} roughness={0.8} />
    </instancedMesh>
  )
}

// Campfires get a small flicker on the flame cone via a per-frame
// scale modulation. Cheap; uniform across all instances since it's
// the same material.
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
      tmp.position.set(px, py + 0.6, pz)
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
      tmp.position.set(px, py + 0.6, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(s, s + 0.1, s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[CAMP_FLAME, undefined, maxCount]}>
      <meshBasicMaterial color="#ff9028" transparent opacity={0.92} />
    </instancedMesh>
  )
}

export function TileFeatures({ tiles, biomes, depthMap, width, height }: Props) {
  const features = useMemo(
    () => collectFeatures(tiles, biomes, depthMap, width, height),
    [tiles, biomes, depthMap, width, height],
  )

  return (
    <>
      {/* Trees: trunk + canopy as two layers stacked vertically. Random
          yaw + scale so the forest doesn't look like a regular grid. */}
      <InstanceLayer
        positions={features.trees} yOffset={0.7}
        geometry={TRUNK_GEO} color="#5a3f25"
        maxCount={12000} randomYaw
      />
      <InstanceLayer
        positions={features.trees} yOffset={2.3}
        geometry={CANOPY_GEO} color="#2f6635"
        maxCount={12000} randomYaw
      />

      <InstanceLayer
        positions={features.huts} yOffset={0.7}
        geometry={HUT_BODY} color="#8a6a40"
        maxCount={500}
      />
      <InstanceLayer
        positions={features.huts} yOffset={1.9}
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
        positions={features.fires} yOffset={0.5}
        geometry={CAMP_FLAME} color="#ff5028"
        maxCount={500} scale={1.4}
      />

      <InstanceLayer
        positions={features.rocks} yOffset={0.3}
        geometry={ROCK_GEO} color="#7a7a7a"
        maxCount={3000} randomYaw
      />

      <InstanceLayer
        positions={features.minerals} yOffset={0.3}
        geometry={MINERAL_GEO} color="#a8b8d8"
        maxCount={1000} randomYaw
      />
    </>
  )
}
