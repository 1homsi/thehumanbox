import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import type { WebGLProgramParametersWithUniforms } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  tiles: number[][]
  biomes: number[][]
  depthMap: number[][]
  width: number
  height: number
}

const COUNT = 900
const RADIUS_TILES = 34
const RESCATTER_DIST = 6

const TUFT_GEO = (() => {
  const a = new PlaneGeometry(0.55, 0.85)
  a.translate(0, 0.42, 0)
  const b = a.clone()
  b.rotateY(Math.PI / 2)
  const merged = mergeGeometries([a, b])
  return merged ?? a
})()

const _mat = new Matrix4()
const _pos = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _axis = new Vector3(0, 1, 0)
const _col = new Color()

function hash01(n: number): number {
  let h = (n * 2654435761) >>> 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

export function GrassTufts({ tiles, biomes, depthMap, width, height }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const timeRef = useRef({ value: 0 })
  const lastScatter = useRef({ x: -9999, y: -9999 })

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.9,
      side: DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    })
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTuftTime = timeRef.current
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTuftTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           {
             vec4 tuftWorld = instanceMatrix * vec4(transformed, 1.0);
             float bendFactor = clamp(transformed.y, 0.0, 1.0);
             transformed.x += sin(uTuftTime * 1.8 + tuftWorld.x * 0.35 + tuftWorld.z * 0.3)
                              * 0.12 * bendFactor;
             transformed.z += cos(uTuftTime * 1.4 + tuftWorld.x * 0.27)
                              * 0.08 * bendFactor;
           }`,
        )
    }
    return m
  }, [])

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    timeRef.current.value = clock.getElapsedTime()

    const camTx = camera.position.x / TILE_SCALE
    const camTy = camera.position.z / TILE_SCALE
    const dx = camTx - lastScatter.current.x
    const dy = camTy - lastScatter.current.y
    if (dx * dx + dy * dy < RESCATTER_DIST * RESCATTER_DIST) return
    lastScatter.current = { x: camTx, y: camTy }

    let placed = 0
    for (let i = 0; i < COUNT * 2 && placed < COUNT; i++) {
      const cellX = Math.floor(camTx) + Math.floor((hash01(i * 7 + 1) - 0.5) * RADIUS_TILES * 2)
      const cellY = Math.floor(camTy) + Math.floor((hash01(i * 13 + 5) - 0.5) * RADIUS_TILES * 2)
      if (cellX < 1 || cellY < 1 || cellX >= width - 1 || cellY >= height - 1) continue
      const t = tiles[cellY]?.[cellX]
      if (t !== 1 && t !== 3) continue
      const seed = ((cellX * 73856093) ^ (cellY * 19349663) ^ (i * 83492791)) >>> 0
      const jx = hash01(seed) - 0.5
      const jy = hash01(seed + 17) - 0.5
      const tx = cellX + 0.5 + jx * 0.9
      const ty = cellY + 0.5 + jy * 0.9
      const gy = heightAt(tx, ty, depthMap, biomes)
      if (gy < 0.1) continue
      _pos.set(tx * TILE_SCALE, gy, ty * TILE_SCALE)
      _quat.setFromAxisAngle(_axis, hash01(seed + 31) * Math.PI)
      const s = 0.7 + hash01(seed + 47) * 0.9
      _scale.set(s, s * (0.8 + hash01(seed + 61) * 0.5), s)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(placed, _mat)
      const hue = 0.27 + (hash01(seed + 71) - 0.5) * 0.05
      const lit = 0.3 + hash01(seed + 89) * 0.14
      _col.setHSL(hue, 0.42, lit)
      mesh.setColorAt(placed, _col)
      placed++
    }
    for (let i = placed; i < COUNT; i++) {
      _pos.set(0, -1000, 0)
      _scale.set(0, 0, 0)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[TUFT_GEO, material, COUNT]} frustumCulled={false} renderOrder={2} />
  )
}
