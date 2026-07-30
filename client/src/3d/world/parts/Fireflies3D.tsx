import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { isWaterTile } from '../../../world/terrain-ids'

interface Props {
  width: number
  height: number
  tiles: number[][] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
  dayProgress: number
}

const FLY_GEO = new SphereGeometry(0.34, 6, 5)
const FLY_MAT = new MeshBasicMaterial({
  color: '#e8ff88',
  transparent: true,
  opacity: 0,
  blending: AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

const SWARMS = 26
const PER_SWARM = 14
const TOTAL = SWARMS * PER_SWARM
const tmp = new Object3D()
const _col = new Color()

export function Fireflies3D({ width, height, tiles, depthMap, biomes, dayProgress }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const flies = useMemo(() => {
    if (!depthMap || !biomes || !tiles) return []
    const land: Array<[number, number]> = []
    const step = Math.max(2, Math.floor(Math.min(width, height) / 40))
    for (let y = 0; y < height; y += step) {
      const row = tiles[y]
      if (!row) continue
      for (let x = 0; x < width; x += step) {
        if (row[x] !== undefined && !isWaterTile(row[x])) land.push([x, y])
      }
    }
    if (land.length === 0) return []
    const arr: Array<{
      cx: number
      cz: number
      cy: number
      r: number
      ang: number
      spin: number
      bob: number
      tw: number
    }> = []
    for (let s = 0; s < SWARMS; s++) {
      const pick = land[Math.floor((((s * 2654435761) % land.length) + land.length) % land.length)]
      const tx = pick[0]
      const tz = pick[1]
      const cx = (tx + 0.5) * TILE_SCALE
      const cz = (tz + 0.5) * TILE_SCALE
      const cy = heightAt(tx, tz, depthMap, biomes)
      for (let i = 0; i < PER_SWARM; i++) {
        const seed = s * 100 + i
        arr.push({
          cx,
          cz,
          cy,
          r: 2 + ((seed * 53) % 60) / 10,
          ang: ((seed * 131) % 628) / 100,
          spin: 0.2 + ((seed * 17) % 30) / 100,
          bob: 0.6 + ((seed * 29) % 30) / 10,
          tw: ((seed * 71) % 628) / 100,
        })
      }
    }
    return arr
  }, [width, height, tiles, depthMap, biomes])

  const nightFrac = (() => {
    const p = dayProgress
    if (p < 0.25) return Math.min(1, (0.25 - p) / 0.08)
    if (p > 0.75) return Math.min(1, (p - 0.75) / 0.08)
    return 0
  })()

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (nightFrac <= 0 || flies.length === 0) {
      mesh.count = 0
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i]
      const a = f.ang + t * f.spin
      const x = f.cx + Math.cos(a) * f.r
      const z = f.cz + Math.sin(a * 1.3) * f.r
      const y = f.cy + 1.4 + Math.sin(t * 0.9 + f.bob) * f.bob
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + f.tw))
      tmp.position.set(x, y, z)
      const sc = 0.5 + twinkle * 0.7
      tmp.scale.set(sc, sc, sc)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, _col.setScalar(twinkle * nightFrac))
    }
    mesh.count = flies.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    FLY_MAT.opacity = nightFrac
  })

  if (nightFrac <= 0) return null

  return (
    <instancedMesh ref={meshRef} args={[FLY_GEO, FLY_MAT, TOTAL]} frustumCulled={false} renderOrder={60} />
  )
}
