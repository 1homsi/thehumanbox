import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'
import { getWildernessPalette } from './wilderness-palette'

interface Props {
  width: number
  height: number
  dayProgress?: number
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  intensity?: number
}

const CLOUDS = 11
const PUFFS_PER_CLOUD = 6
const TOTAL = CLOUDS * PUFFS_PER_CLOUD
const PUFF_GEO = new THREE.PlaneGeometry(1, 1)

function hash(i: number, salt: number): number {
  let h = ((i + 1) * 9301 + (salt + 17) * 49297) | 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

let _cachedTex: THREE.CanvasTexture | null = null
function getCloudTexture(): THREE.CanvasTexture {
  if (_cachedTex) return _cachedTex
  const SIZE = 256
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)

  const lumps = [
    { x: SIZE * 0.5, y: SIZE * 0.58, r: SIZE * 0.4 },
    { x: SIZE * 0.34, y: SIZE * 0.54, r: SIZE * 0.26 },
    { x: SIZE * 0.66, y: SIZE * 0.52, r: SIZE * 0.28 },
    { x: SIZE * 0.45, y: SIZE * 0.4, r: SIZE * 0.22 },
    { x: SIZE * 0.6, y: SIZE * 0.66, r: SIZE * 0.2 },
  ]
  for (const lump of lumps) {
    const grad = ctx.createRadialGradient(lump.x, lump.y, 0, lump.x, lump.y, lump.r)
    grad.addColorStop(0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.5)')
    grad.addColorStop(0.8, 'rgba(255,255,255,0.1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.generateMipmaps = true
  tex.needsUpdate = true
  _cachedTex = tex
  return tex
}

interface PuffParams {
  cloud: number
  offX: number
  offY: number
  offZ: number
  size: number
  roll: number
}

interface CloudParams {
  baseX: number
  baseZ: number
  y: number
  size: number
  drift: number
  phase: number
  swayAmp: number
}

const tmp = new THREE.Object3D()
const _rollQuat = new THREE.Quaternion()
const _zAxis = new THREE.Vector3(0, 0, 1)
const _dayCol = new THREE.Color()
const _nightCol = new THREE.Color()

export function Clouds3D({ width, height, dayProgress = 0.5, weatherKind = 'clear', intensity = 0 }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const cloudTex = useMemo(() => getCloudTexture(), [])
  const atmosphere = getWildernessPalette(dayProgress, weatherKind)

  const cx = width * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const radius = Math.max(width, height) * TILE_SCALE * 0.9

  const { clouds, puffs } = useMemo(() => {
    const clouds: CloudParams[] = []
    const puffs: PuffParams[] = []
    for (let c = 0; c < CLOUDS; c++) {
      const size = 70 + hash(c, 4) * 60
      clouds.push({
        baseX: cx + (hash(c, 1) - 0.5) * radius * 2,
        baseZ: cz + (hash(c, 2) - 0.5) * radius * 2,
        y: 235 + hash(c, 3) * 45,
        size,
        drift: 0.35 + hash(c, 5) * 0.4,
        phase: hash(c, 6) * Math.PI * 2,
        swayAmp: 3 + hash(c, 7) * 5,
      })
      for (let p = 0; p < PUFFS_PER_CLOUD; p++) {
        const k = c * PUFFS_PER_CLOUD + p
        const spread = p === 0 ? 0 : 0.25 + hash(k, 11) * 0.45
        const ang = hash(k, 12) * Math.PI * 2
        puffs.push({
          cloud: c,
          offX: Math.cos(ang) * spread * size,
          offY: (hash(k, 13) - 0.35) * size * 0.16,
          offZ: Math.sin(ang) * spread * size * 0.4,
          size: size * (p === 0 ? 1.0 : 0.45 + hash(k, 14) * 0.4),
          roll: (hash(k, 15) - 0.5) * 1.6,
        })
      }
    }
    return { clouds, puffs }
  }, [cx, cz, radius])

  const coverage =
    weatherKind === 'storm'
      ? 1.0
      : weatherKind === 'rain'
        ? 0.75 + intensity * 0.25
        : weatherKind === 'wet'
          ? 0.6
          : 0.45
  const activeClouds = Math.max(2, Math.floor(CLOUDS * coverage))
  const activePuffs = activeClouds * PUFFS_PER_CLOUD

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()

    const sunAlt = Math.sin((dayProgress - 0.25) * 2 * Math.PI)
    const dayWeight = smoothstep(-0.12, 0.22, sunAlt)

    if (matRef.current) {
      _dayCol.set(atmosphere.cloud)
      _nightCol.setHex(0x10141f)
      matRef.current.color.copy(_nightCol).lerp(_dayCol, dayWeight)
      const dayOpacity = weatherKind === 'storm' ? 0.85 : weatherKind === 'rain' ? 0.78 : 0.7
      matRef.current.opacity = 0.14 + (dayOpacity - 0.14) * dayWeight
    }

    for (let i = 0; i < activePuffs; i++) {
      const p = puffs[i]
      const c = clouds[p.cloud]
      const driftX = ((c.baseX - cx + t * c.drift * 5 + radius) % (radius * 2)) - radius
      const x = cx + driftX + p.offX
      const y = c.y + p.offY + Math.sin(t * 0.07 + c.phase) * 1.2
      const z = c.baseZ + Math.cos(t * 0.05 + c.phase) * c.swayAmp + p.offZ
      tmp.position.set(x, y, z)
      tmp.quaternion.copy(camera.quaternion)
      _rollQuat.setFromAxisAngle(_zAxis, p.roll)
      tmp.quaternion.multiply(_rollQuat)
      tmp.scale.set(p.size, p.size * 0.52, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    for (let i = activePuffs; i < TOTAL; i++) {
      tmp.position.set(0, -1000, 0)
      tmp.scale.set(0, 0, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = activePuffs
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[PUFF_GEO, undefined, TOTAL]}
      count={activePuffs}
      frustumCulled={false}
      renderOrder={50}
    >
      <meshBasicMaterial
        ref={matRef}
        map={cloudTex}
        color="#ffffff"
        transparent
        opacity={0.7}
        depthWrite={false}
        depthTest={true}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
