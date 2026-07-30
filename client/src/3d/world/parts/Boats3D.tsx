import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { TILE_ID } from '../../../world/terrain-ids'

interface Props {
  tiles: number[][] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
  width: number
  height: number
}

const MAX_BOATS = 60
const tmp = new Object3D()

function buildBoatGeo() {
  const hull = new BoxGeometry(1.2, 0.18, 0.4)
  hull.translate(0, 0.1, 0)
  const sideL = new BoxGeometry(1.0, 0.1, 0.04)
  sideL.translate(0, 0.22, -0.2)
  const sideR = sideL.clone()
  sideR.translate(0, 0, 0.4)
  const mast = new BoxGeometry(0.04, 0.7, 0.04)
  mast.translate(0, 0.55, 0)
  const sail = new BoxGeometry(0.04, 0.45, 0.4)
  sail.translate(0, 0.55, 0)
  const merged = mergeGeometries([hull, sideL, sideR, mast, sail])
  if (merged) merged.computeVertexNormals()
  return merged ?? hull
}

export function Boats3D({ tiles, depthMap, biomes, width, height }: Props) {
  const geo = useMemo(() => buildBoatGeo(), [])
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#caa07a', roughness: 0.85 }), [])
  const meshRef = useRef<InstancedMesh>(null)

  const positions = useMemo(() => {
    if (!tiles || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; phase: number }> = []
    const W = width
    const H = height
    for (let row = 0; row < H; row += 6) {
      const r = tiles[row]
      if (!r) continue
      for (let col = 0; col < W; col += 6) {
        if (r[col] !== TILE_ID.WATER) continue
        let landNearby = false
        for (let dy = -1; dy <= 1 && !landNearby; dy++) {
          for (let dx = -1; dx <= 1 && !landNearby; dx++) {
            const ny = row + dy * 6
            const nx = col + dx * 6
            if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue
            const rn = tiles[ny]
            if (!rn) continue
            if (rn[nx] !== TILE_ID.WATER && rn[nx] !== undefined) landNearby = true
          }
        }
        if (!landNearby) continue
        const seed = (col * 9301 + row * 49297) % 233280
        if (seed % 100 > 20) continue
        const wx = col * TILE_SCALE
        const wz = row * TILE_SCALE
        const wy = heightAt(col, row, depthMap, biomes) + 0.05
        out.push({ x: wx, y: wy, z: wz, phase: (seed % 628) / 100 })
        if (out.length >= MAX_BOATS) break
      }
      if (out.length >= MAX_BOATS) break
    }
    return out
  }, [tiles, depthMap, biomes, width, height])

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    const mesh = meshRef.current
    if (!mesh) return
    if (positions.length === 0) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      const bob = Math.sin(t * 1.4 + p.phase) * 0.08
      const sway = Math.sin(t * 0.8 + p.phase * 1.7) * 0.05
      tmp.position.set(p.x, p.y + bob, p.z)
      tmp.rotation.set(sway, p.phase, sway * 0.5)
      tmp.scale.setScalar(0.7)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
  })

  if (positions.length === 0) return null
  return <instancedMesh ref={meshRef} args={[geo, mat, MAX_BOATS]} castShadow frustumCulled={false} />
}
