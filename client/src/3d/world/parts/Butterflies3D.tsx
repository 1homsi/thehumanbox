import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { BIOME_ID, isWaterTile } from '../../../world/terrain-ids'

interface Props {
  width: number
  height: number
  tiles: number[][] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
  dayProgress: number
}

const WING_GEO = (() => {
  const l = new BoxGeometry(0.34, 0.02, 0.26)
  l.translate(-0.2, 0, 0)
  const r = new BoxGeometry(0.34, 0.02, 0.26)
  r.translate(0.2, 0, 0)
  const g = mergeGeometries([l, r])
  return g
})()

const WING_MAT = new MeshStandardMaterial({ roughness: 0.7, metalness: 0, vertexColors: false })

const PALETTE = ['#f4d23a', '#ef8a3a', '#e6f2f7', '#d36a86', '#7aa6e0', '#f0b8d0']
const COUNT = 90
const tmp = new Object3D()
const _col = new Color()

export function Butterflies3D({ width, height, tiles, depthMap, biomes, dayProgress }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const flutters = useMemo(() => {
    if (!depthMap || !biomes || !tiles) return []
    const meadow: Array<[number, number]> = []
    const step = Math.max(2, Math.floor(Math.min(width, height) / 50))
    for (let y = 0; y < height; y += step) {
      const row = tiles[y]
      const brow = biomes[y]
      if (!row || !brow) continue
      for (let x = 0; x < width; x += step) {
        if (
          row[x] !== undefined &&
          !isWaterTile(row[x]) &&
          (brow[x] === BIOME_ID.GRASSLAND || brow[x] === BIOME_ID.FOREST)
        ) {
          meadow.push([x, y])
        }
      }
    }
    if (meadow.length === 0) return []
    const arr: Array<{
      cx: number
      cz: number
      cy: number
      r: number
      ang: number
      spin: number
      flap: number
      color: string
    }> = []
    for (let i = 0; i < COUNT; i++) {
      const pick = meadow[Math.floor((((i * 2654435761) % meadow.length) + meadow.length) % meadow.length)]
      const cx = (pick[0] + 0.5) * TILE_SCALE
      const cz = (pick[1] + 0.5) * TILE_SCALE
      const cy = heightAt(pick[0], pick[1], depthMap, biomes)
      arr.push({
        cx,
        cz,
        cy,
        r: 1 + ((i * 53) % 30) / 10,
        ang: ((i * 131) % 628) / 100,
        spin: 0.4 + ((i * 17) % 50) / 100,
        flap: ((i * 71) % 100) / 10,
        color: PALETTE[i % PALETTE.length],
      })
    }
    return arr
  }, [width, height, tiles, depthMap, biomes])

  const dayFrac = (() => {
    const p = dayProgress
    if (p < 0.26 || p > 0.74) return 0
    if (p < 0.32) return (p - 0.26) / 0.06
    if (p > 0.68) return (0.74 - p) / 0.06
    return 1
  })()

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (dayFrac <= 0 || flutters.length === 0) {
      mesh.count = 0
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < flutters.length; i++) {
      const f = flutters[i]
      const a = f.ang + t * f.spin
      const x = f.cx + Math.cos(a) * f.r + Math.sin(t * 1.7 + f.flap) * 0.4
      const z = f.cz + Math.sin(a * 1.4) * f.r
      const y = f.cy + 1.0 + Math.abs(Math.sin(t * 1.3 + f.flap)) * 1.1
      const flap = 0.2 + Math.abs(Math.sin(t * 9 + f.flap)) * 1.0
      tmp.position.set(x, y, z)
      tmp.rotation.set(flap, -a, 0)
      tmp.scale.setScalar(1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, _col.set(f.color))
    }
    mesh.count = flutters.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (dayFrac <= 0) return null

  return <instancedMesh ref={meshRef} args={[WING_GEO, WING_MAT, COUNT]} frustumCulled={false} />
}
