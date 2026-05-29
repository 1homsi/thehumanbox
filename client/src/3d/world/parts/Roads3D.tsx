import { useMemo, useRef, useLayoutEffect } from 'react'
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  lineageEras: Record<string, string> | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

const ROAD_GEO = new BoxGeometry(1, 0.05, 0.4)
const ROAD_MAT = new MeshStandardMaterial({ color: '#7c6a52', roughness: 0.95 })

const ROAD_MAX_DIST_PRE = 12
const ROAD_MAX_DIST_POST = 32
const MAX_SEGMENTS = 800
const tmp = new Object3D()

export function Roads3D({ buildings, lineageEras, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const segments = useMemo(() => {
    if (!buildings || !lineageEras || !depthMap || !biomes) return []
    const result: Array<{ x: number; z: number; y: number; len: number; rot: number }> = []
    const byLineage = new Map<string, Building[]>()
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.6) continue
      const lid = b.owner_lineage ?? b.lineage_id
      if (!lid) continue
      if (!byLineage.has(lid)) byLineage.set(lid, [])
      byLineage.get(lid)!.push(b)
    }
    for (const [lid, list] of byLineage) {
      if (list.length < 2) continue
      const era = lineageEras[lid]
      const advanced = era === 'industrial' || era === 'modern' || era === 'information' || era === 'atomic' || era === 'space'
      const maxDist = advanced ? ROAD_MAX_DIST_POST : ROAD_MAX_DIST_PRE
      const connected = new Set<number>()
      list.sort((a, b) => a.id - b.id)
      for (let i = 0; i < list.length && result.length < MAX_SEGMENTS; i++) {
        let nearest: Building | null = null
        let bestD = Infinity
        const a = list[i]
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue
          const b = list[j]
          const k = i < j ? i * 10000 + j : j * 10000 + i
          if (connected.has(k)) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > maxDist) continue
          if (d < bestD) {
            bestD = d
            nearest = b
          }
        }
        if (!nearest) continue
        const j = list.indexOf(nearest)
        const k = i < j ? i * 10000 + j : j * 10000 + i
        connected.add(k)
        const ax = (a.x + 0.5) * TILE_SCALE
        const az = (a.y + 0.5) * TILE_SCALE
        const bx = (nearest.x + 0.5) * TILE_SCALE
        const bz = (nearest.y + 0.5) * TILE_SCALE
        const midX = (ax + bx) / 2
        const midZ = (az + bz) / 2
        const midGy = heightAt(
          Math.floor((a.x + nearest.x) / 2),
          Math.floor((a.y + nearest.y) / 2),
          depthMap,
          biomes,
        )
        const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
        const rot = Math.atan2(bz - az, bx - ax)
        result.push({ x: midX, z: midZ, y: midGy + 0.025, len, rot })
      }
    }
    return result.slice(0, MAX_SEGMENTS)
  }, [buildings, lineageEras, depthMap, biomes])

  // Roads are static geometry — fill instance matrices once whenever the
  // segment set changes, not every frame.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      tmp.position.set(s.x, s.y, s.z)
      tmp.rotation.set(0, -s.rot, 0)
      tmp.scale.set(s.len, 1, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = segments.length
    mesh.instanceMatrix.needsUpdate = true
  }, [segments])

  if (segments.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[ROAD_GEO, ROAD_MAT, MAX_SEGMENTS]}
      receiveShadow
      frustumCulled={false}
    />
  )
}
