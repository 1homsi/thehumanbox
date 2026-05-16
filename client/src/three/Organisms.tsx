import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { TILE_SCALE, MAX_DEPTH, BIOME_ELEVATION } from './constants'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

const ORG_HEIGHT  = 1.6
const ORG_RADIUS  = 0.35
const SHARED_GEO  = new THREE.CapsuleGeometry(ORG_RADIUS, ORG_HEIGHT - ORG_RADIUS * 2, 4, 6)
const SHARED_MAT  = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 })
const tmp         = new THREE.Object3D()
const tmpColor    = new THREE.Color()

// Single InstancedMesh draws every alive org in one GPU call. Each
// instance gets its own matrix (position + scale) and per-instance
// color (from lineageColor). Capped at 1024 instances - the sim's
// MAX_POPULATION is 300, so this leaves headroom.
const MAX_INSTANCES = 1024

// Helper: terrain height at a tile coordinate, mirrors the math in
// Terrain.tsx so orgs sit ON the surface (not floating, not buried).
function heightAt(x: number, y: number, depthMap: number[][], biomes: number[][]): number {
  const ix = Math.max(0, Math.min(depthMap[0]?.length - 1, Math.floor(x)))
  const iy = Math.max(0, Math.min(depthMap.length - 1, Math.floor(y)))
  const d = depthMap[iy]?.[ix] ?? 255
  if (d >= 254) {
    const b = biomes[iy]?.[ix] ?? 0
    return BIOME_ELEVATION[b] ?? 0
  }
  const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
  return -depthFrac * MAX_DEPTH
}

export function Organisms({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // Per-frame update of instance transforms + colors. Cheap: O(N) on
  // an ~300-element array, plus the GPU upload at the end. Rebinds
  // count so dead orgs don't ghost-render at their last position.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !depthMap || !biomes) return

    const alive = organisms.filter(o => o.alive)
    const count = Math.min(alive.length, MAX_INSTANCES)
    mesh.count = count

    for (let i = 0; i < count; i++) {
      const o = alive[i]
      const groundY = heightAt(o.x, o.y, depthMap, biomes)
      tmp.position.set(
        o.x * TILE_SCALE,
        groundY + ORG_HEIGHT / 2,
        o.y * TILE_SCALE,
      )
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)

      // Color from lineage. Three.Color parses hsl() strings directly.
      tmpColor.set(lineageColor(o.lineage_id))
      mesh.setColorAt(i, tmpColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [organisms, depthMap, biomes])

  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_GEO, SHARED_MAT, MAX_INSTANCES]}
      castShadow
      receiveShadow
      // Start with count=0 so we don't draw uninitialized instances
      // on the very first frame before the effect runs.
      count={0}
    />
  )
}
