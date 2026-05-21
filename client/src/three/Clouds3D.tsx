import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  width:        number
  height:       number
  isNight?:     boolean
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  intensity?:   number
  dayProgress?: number
  windX?:       number
  windY?:       number
}

const MAX_BLOBS     = 26
const PUFFS_PER     = 7
const MAX_INSTANCES = MAX_BLOBS * PUFFS_PER
const CLOUD_GEO     = new SphereGeometry(8, 10, 8)

interface PuffParams {
  ox:     number
  oy:     number
  oz:     number
  scl:    number
  bobAmp: number
}

interface BlobParams {
  baseX:    number
  baseZ:    number
  yJitter:  number
  size:     number
  drift:    number
  phase:    number
  bobPhase: number
  puffs:    PuffParams[]
}

const tmp = new Object3D()
const tmpColor = new Color()
const warmColor = new Color('#ffd6a8')
const coolColor = new Color('#ffffff')
const stormColor = new Color('#5e6878')
const rainColor = new Color('#9eaab8')
const nightColor = new Color('#2a3148')

function hash(i: number, salt: number): number {
  let h = ((i + 1) * 9301 + (salt + 17) * 49297) | 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

export function Clouds3D({
  width,
  height,
  isNight = false,
  weatherKind = 'clear',
  intensity = 0,
  dayProgress = 0.5,
  windX = 0,
  windY = 0,
}: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const matRef  = useRef<MeshStandardMaterial>(null)

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const radius = Math.max(width, height) * TILE_SCALE * 0.9

  const blobs = useMemo<BlobParams[]>(() => {
    const out: BlobParams[] = []
    for (let i = 0; i < MAX_BLOBS; i++) {
      const sizeRoll = hash(i, 4)
      const size = sizeRoll < 0.15
        ? 1.4 + sizeRoll * 0.8
        : 0.7 + sizeRoll * 0.7
      const puffs: PuffParams[] = []
      for (let s = 0; s < PUFFS_PER; s++) {
        const a = hash(i * PUFFS_PER + s, 21) * Math.PI * 2
        const r = s === 0 ? 0 : (3 + hash(i * PUFFS_PER + s, 22) * 7)
        const ox = Math.cos(a) * r
        const oz = Math.sin(a) * r * 0.65
        const oy = (hash(i * PUFFS_PER + s, 23) - 0.5) * 4
        const scl = (s === 0 ? 1.25 : 0.55 + hash(i * PUFFS_PER + s, 24) * 0.6)
        const bobAmp = 0.5 + hash(i * PUFFS_PER + s, 25) * 1.5
        puffs.push({ ox, oy, oz, scl, bobAmp })
      }
      out.push({
        baseX:    cx + (hash(i, 1) - 0.5) * radius * 2,
        baseZ:    cz + (hash(i, 2) - 0.5) * radius * 2,
        yJitter:  hash(i, 3) * 50,
        size,
        drift:    0.35 + hash(i, 5) * 0.7,
        phase:    hash(i, 6) * Math.PI * 2,
        bobPhase: hash(i, 7) * Math.PI * 2,
        puffs,
      })
    }
    return out
  }, [cx, cz, radius])

  const coverage = weatherKind === 'storm' ? 1.0
                : weatherKind === 'rain'  ? 0.85 + intensity * 0.15
                : weatherKind === 'wet'   ? 0.55
                :                            0.45
  const activeBlobs = Math.floor(MAX_BLOBS * coverage)
  const totalInstances = activeBlobs * PUFFS_PER

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()

    if (matRef.current) {
      const dpAngle = (dayProgress - 0.25) * 2 * Math.PI
      const sunAlt = Math.sin(dpAngle)
      const twilight = Math.max(0, 1 - Math.abs(sunAlt) * 3.5)
      if (isNight) {
        tmpColor.copy(nightColor)
      } else if (weatherKind === 'storm') {
        tmpColor.copy(stormColor)
      } else if (weatherKind === 'rain') {
        tmpColor.copy(rainColor)
      } else {
        tmpColor.copy(coolColor).lerp(warmColor, twilight * 0.8)
      }
      matRef.current.color.copy(tmpColor)
      matRef.current.opacity = isNight ? 0.4
        : weatherKind === 'storm' ? 0.88
        : weatherKind === 'rain'  ? 0.78
        : 0.62
      matRef.current.emissive.copy(tmpColor)
      matRef.current.emissiveIntensity = isNight ? 0.08 : weatherKind === 'storm' ? 0.05 : 0.18
    }

    const driftSpeedX = (3 + windX * 12)
    const driftSpeedZ = (windY * 12)

    let inst = 0
    for (let b = 0; b < activeBlobs; b++) {
      const p = blobs[b]
      const span = radius * 2
      const xRaw = p.baseX + t * (p.drift * driftSpeedX)
      const zRaw = p.baseZ + t * (p.drift * driftSpeedZ)
      const cxBlob = ((xRaw - cx + radius) % span + span) % span - radius + cx
      const czBlob = ((zRaw - cz + radius) % span + span) % span - radius + cz
      const bobBase = Math.sin(t * 0.3 + p.bobPhase) * 4
      const cyBlob = 220 + p.yJitter + bobBase

      for (let s = 0; s < PUFFS_PER; s++) {
        const pf = p.puffs[s]
        const bob = Math.sin(t * 0.0003 * 1000 + b + s * 0.7) * pf.bobAmp
        const scl = p.size * pf.scl
        tmp.position.set(
          cxBlob + pf.ox * p.size,
          cyBlob + pf.oy + bob,
          czBlob + pf.oz * p.size,
        )
        tmp.rotation.set(0, 0, 0)
        tmp.scale.set(scl, scl * 0.72, scl)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst++, tmp.matrix)
      }
    }
    for (; inst < MAX_INSTANCES; inst++) {
      tmp.position.set(0, -10000, 0)
      tmp.scale.set(0, 0, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(inst, tmp.matrix)
    }
    mesh.count = totalInstances
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[CLOUD_GEO, undefined, MAX_INSTANCES]}
      count={totalInstances}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    >
      <meshStandardMaterial
        ref={matRef}
        color="#ffffff"
        transparent
        opacity={0.62}
        roughness={1.0}
        metalness={0}
        depthWrite={false}
        flatShading={false}
      />
    </instancedMesh>
  )
}
