import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  width: number
  height: number
  isNight?: boolean
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  intensity?: number
}

// Billboarded soft-alpha puff clouds. Cheap (one quad per puff,
// shared canvas texture) but reads as proper drifting cumulus from
// any camera angle. Tuned to look painterly, not photoreal.
const PUFFS = 36
const PUFF_GEO = new THREE.PlaneGeometry(1, 1)

function hash(i: number, salt: number): number {
  let h = ((i + 1) * 9301 + (salt + 17) * 49297) | 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

// Build the soft cloud sprite once. A blobby radial alpha gradient
// with three lumps so the silhouette isn't a perfect circle.
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
    { x: SIZE * 0.5, y: SIZE * 0.55, r: SIZE * 0.42 },
    { x: SIZE * 0.38, y: SIZE * 0.5, r: SIZE * 0.3 },
    { x: SIZE * 0.62, y: SIZE * 0.48, r: SIZE * 0.32 },
    { x: SIZE * 0.5, y: SIZE * 0.42, r: SIZE * 0.28 },
    { x: SIZE * 0.46, y: SIZE * 0.62, r: SIZE * 0.22 },
  ]
  for (const lump of lumps) {
    const grad = ctx.createRadialGradient(lump.x, lump.y, 0, lump.x, lump.y, lump.r)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)')
    grad.addColorStop(0.85, 'rgba(255,255,255,0.12)')
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
  baseX: number
  baseZ: number
  yJitter: number
  size: number
  drift: number
  phase: number
  swayAmp: number
}

const tmp = new THREE.Object3D()

export function Clouds3D({ width, height, isNight = false, weatherKind = 'clear', intensity = 0 }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const cloudTex = useMemo(() => getCloudTexture(), [])

  const cx = width * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const radius = Math.max(width, height) * TILE_SCALE * 0.9

  const puffs = useMemo<PuffParams[]>(() => {
    const out: PuffParams[] = []
    for (let i = 0; i < PUFFS; i++) {
      out.push({
        baseX: cx + (hash(i, 1) - 0.5) * radius * 2,
        baseZ: cz + (hash(i, 2) - 0.5) * radius * 2,
        yJitter: hash(i, 3) * 28,
        // Big puffs read better in this style — 90–160 world units across
        size: 90 + hash(i, 4) * 70,
        drift: 0.4 + hash(i, 5) * 0.45,
        phase: hash(i, 6) * Math.PI * 2,
        swayAmp: 3 + hash(i, 7) * 5,
      })
    }
    return out
  }, [cx, cz, radius])

  const coverage =
    weatherKind === 'storm'
      ? 1.0
      : weatherKind === 'rain'
        ? 0.7 + intensity * 0.3
        : weatherKind === 'wet'
          ? 0.55
          : 0.4
  const active = Math.floor(PUFFS * coverage)

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    if (matRef.current) {
      // Daylight clouds = white; storm = slate; rain = muted; night = deep navy.
      matRef.current.color.setHex(
        isNight
          ? 0x2a3148
          : weatherKind === 'storm'
            ? 0x6a7484
            : weatherKind === 'rain'
              ? 0xb8c0cc
              : 0xffffff,
      )
      matRef.current.opacity = isNight ? 0.55 : weatherKind === 'storm' ? 0.85 : 0.78
    }

    for (let i = 0; i < active; i++) {
      const p = puffs[i]
      const driftX = ((p.baseX - cx + t * p.drift * 5 + radius) % (radius * 2)) - radius
      const x = cx + driftX
      const y = 215 + p.yJitter + Math.sin(t * 0.07 + p.phase) * 1.2
      const z = p.baseZ + Math.cos(t * 0.05 + p.phase) * p.swayAmp
      tmp.position.set(x, y, z)
      // Billboard toward the camera each frame.
      tmp.quaternion.copy(camera.quaternion)
      tmp.scale.set(p.size, p.size * 0.6, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    for (let i = active; i < PUFFS; i++) {
      tmp.position.set(0, -1000, 0)
      tmp.scale.set(0, 0, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = active
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[PUFF_GEO, undefined, PUFFS]}
      count={active}
      frustumCulled={false}
      renderOrder={50}
    >
      <meshBasicMaterial
        ref={matRef}
        map={cloudTex}
        color="#ffffff"
        transparent
        opacity={0.78}
        depthWrite={false}
        depthTest={true}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
