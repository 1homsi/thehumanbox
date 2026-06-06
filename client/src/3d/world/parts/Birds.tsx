import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ConeGeometry, InstancedMesh, Object3D } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  width: number
  height: number
  isNight?: boolean
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
}

const N_BIRDS = 80
const BIRD_BODY = new ConeGeometry(0.18, 0.7, 4)
BIRD_BODY.rotateX(Math.PI / 2)

const tmp = new Object3D()

function hash(i: number, salt: number) {
  let h = ((i + 1) * 9301 + (salt + 17) * 49297) | 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xfffff) / 0xfffff
}

export function Birds({ width, height, isNight = false, weatherKind = 'clear' }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const { camera } = useThree()

  const cx = width * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const radius = Math.max(width, height) * TILE_SCALE * 0.55

  const params = useMemo(() => {
    const arr: { baseX: number; baseZ: number; alt: number; freq: number; phase: number; size: number }[] = []
    for (let i = 0; i < N_BIRDS; i++) {
      arr.push({
        baseX: cx + (hash(i, 1) - 0.5) * radius * 2,
        baseZ: cz + (hash(i, 2) - 0.5) * radius * 2,
        alt: 60 + hash(i, 3) * 80,
        freq: 0.06 + hash(i, 4) * 0.1,
        phase: hash(i, 5) * Math.PI * 2,
        size: 0.6 + hash(i, 6) * 0.7,
      })
    }
    return arr
  }, [cx, cz, radius])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    const visible = !isNight && weatherKind !== 'storm'

    if (!visible) {
      for (let i = 0; i < N_BIRDS; i++) {
        tmp.position.set(0, -1000, 0)
        tmp.scale.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      return
    }

    for (let i = 0; i < N_BIRDS; i++) {
      const p = params[i]
      const orbX = Math.cos(t * p.freq + p.phase) * 18
      const orbZ = Math.sin(t * p.freq * 0.7 + p.phase) * 18
      const x = p.baseX + orbX
      const z = p.baseZ + orbZ
      const y = p.alt + Math.sin(t * p.freq * 2 + p.phase) * 4

      const dx = x - camera.position.x
      const dz = z - camera.position.z
      const distSq = dx * dx + dz * dz
      if (distSq > 1_400_000) {
        tmp.position.set(0, -1000, 0)
        tmp.scale.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
        continue
      }

      const dxOrb = -Math.sin(t * p.freq + p.phase) * 18 * p.freq
      const dzOrb = Math.cos(t * p.freq * 0.7 + p.phase) * 18 * p.freq * 0.7
      const yaw = Math.atan2(dxOrb, dzOrb)

      tmp.position.set(x, y, z)
      tmp.rotation.set(0, yaw, 0)
      const flap = 1 + Math.sin(t * 9 + i * 1.13) * 0.35
      tmp.scale.set(p.size * flap, p.size, p.size)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[BIRD_BODY, undefined, N_BIRDS]} count={N_BIRDS} frustumCulled={false}>
      <meshStandardMaterial color="#2a2a2e" roughness={0.7} />
    </instancedMesh>
  )
}
