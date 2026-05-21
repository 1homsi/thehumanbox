import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  width:        number
  height:       number
  isNight?:     boolean
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  intensity?:   number    // weather intensity 0..1, affects coverage
}

// Drifting cloud layer overhead. ~40 fluffy "cloud" blobs built
// from N sphere instances each, rendered with a soft alpha so they
// read as cumulus from below. The whole layer drifts west to east
// with light wind; storm/rain conditions thicken and darken them.
//
// Cheap: one instanced mesh, per-frame matrix updates for the active
// blob count only. No texture sampling.
const BLOBS         = 48
const SPHERES_PER   = 7
const CLOUD_GEO     = new THREE.SphereGeometry(8, 8, 6)

interface BlobParams {
  baseX:  number
  baseZ:  number
  yJitter: number
  size:   number
  drift:  number
  phase:  number
  spread: number
}

const tmp = new THREE.Object3D()

function hash(i: number, salt: number): number {
  let h = ((i + 1) * 9301 + (salt + 17) * 49297) | 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

export function Clouds3D({ width, height, isNight = false, weatherKind = 'clear', intensity = 0 }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef  = useRef<THREE.MeshStandardMaterial>(null)

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const radius = Math.max(width, height) * TILE_SCALE * 0.85

  const blobs = useMemo<BlobParams[]>(() => {
    const out: BlobParams[] = []
    for (let i = 0; i < BLOBS; i++) {
      out.push({
        baseX:   cx + (hash(i, 1) - 0.5) * radius * 2,
        baseZ:   cz + (hash(i, 2) - 0.5) * radius * 2,
        yJitter: hash(i, 3) * 40,
        size:    0.9 + hash(i, 4) * 1.1,
        drift:   0.6 + hash(i, 5) * 0.8,
        phase:   hash(i, 6) * Math.PI * 2,
        spread:  4 + hash(i, 7) * 6,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cz, radius])

  // Storm thickens + darkens; clear day = whisper-light.
  const coverage = weatherKind === 'storm' ? 1.0
                : weatherKind === 'rain'  ? 0.8 + intensity * 0.2
                : weatherKind === 'wet'   ? 0.55
                :                            0.35
  const activeBlobs = Math.floor(BLOBS * coverage)
  const totalInstances = activeBlobs * SPHERES_PER

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    if (matRef.current) {
      matRef.current.color.setHex(
        isNight ? 0x202840
        : weatherKind === 'storm' ? 0x5e6878
        : weatherKind === 'rain'  ? 0x9eaab8
        : 0xffffff
      )
      matRef.current.opacity = isNight ? 0.45
        : weatherKind === 'storm' ? 0.85
        : 0.55
    }
    let inst = 0
    for (let b = 0; b < activeBlobs; b++) {
      const p = blobs[b]
      // Wind drift in +x direction, wrapping every ~2*radius.
      const driftX = ((p.baseX + t * p.drift * 3) % (radius * 2)) - radius
      const cxBlob = cx + driftX * 0.5
      const cyBlob = 220 + p.yJitter
      const czBlob = p.baseZ + Math.sin(t * 0.05 + p.phase) * 6
      for (let s = 0; s < SPHERES_PER; s++) {
        // Each sphere offsets from the blob centre in a stable cluster.
        const a = (s / SPHERES_PER) * Math.PI * 2 + p.phase
        const r = (s === 0 ? 0 : p.spread + hash(b * SPHERES_PER + s, 11) * 2)
        const dx = Math.cos(a) * r
        const dz = Math.sin(a) * r * 0.6
        const dy = (hash(b * SPHERES_PER + s, 13) - 0.5) * 3
        const scl = p.size * (0.65 + (s === 0 ? 0.6 : 0.0) + hash(b * SPHERES_PER + s, 17) * 0.3)
        tmp.position.set(cxBlob + dx, cyBlob + dy, czBlob + dz)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.set(scl, scl * 0.7, scl)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst++, tmp.matrix)
      }
    }
    // Park unused instances off-screen.
    for (; inst < BLOBS * SPHERES_PER; inst++) {
      tmp.position.set(0, -1000, 0)
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
      args={[CLOUD_GEO, undefined, BLOBS * SPHERES_PER]}
      count={totalInstances}
      frustumCulled={false}
    >
      <meshStandardMaterial
        ref={matRef}
        color="#ffffff"
        transparent
        opacity={0.55}
        roughness={1.0}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
