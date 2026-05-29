import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D, PlaneGeometry } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  dayProgress: number
  width: number
  height: number
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
}

const PATCHES = 28
const tmp = new Object3D()

export function GroundMist({ dayProgress, width, height, weatherKind = 'clear' }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const geo = useMemo(() => new PlaneGeometry(1, 1), [])

  const visibility = useMemo(() => {
    if (weatherKind === 'storm') return 0
    if (dayProgress >= 0.0 && dayProgress < 0.12) return 1 - dayProgress / 0.12
    if (dayProgress >= 0.78 && dayProgress < 0.92) return (dayProgress - 0.78) / 0.14
    if (dayProgress >= 0.92 && dayProgress <= 1.0) return 1 - (dayProgress - 0.92) / 0.08
    return 0
  }, [dayProgress, weatherKind])

  const patches = useMemo(() => {
    const arr: Array<{ x: number; z: number; r: number; s: number; phase: number }> = []
    for (let i = 0; i < PATCHES; i++) {
      const a = ((i * 12.9898) % 1) * width * TILE_SCALE
      const b = ((i * 78.233) % 1) * height * TILE_SCALE
      const sz = 60 + ((i * 437.7) % 1) * 80
      arr.push({ x: a, z: b, r: sz, s: 0.8 + ((i * 5.13) % 1) * 0.6, phase: (i * 1.7) % (Math.PI * 2) })
    }
    return arr
  }, [width, height])

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    const mesh = meshRef.current
    if (!mesh) return
    if (visibility <= 0.01) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < PATCHES; i++) {
      const p = patches[i]
      const drift = Math.sin(t * 0.08 + p.phase) * 8
      const cz = p.z + drift
      tmp.position.set(p.x, 1.2 + Math.sin(t * 0.15 + p.phase) * 0.3, cz)
      tmp.rotation.set(-Math.PI / 2, 0, 0)
      const breathe = 1 + Math.sin(t * 0.25 + p.phase) * 0.1
      tmp.scale.set(p.r * p.s * breathe, p.r * p.s * 0.7 * breathe, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = PATCHES
    mesh.instanceMatrix.needsUpdate = true
  })

  if (visibility <= 0.01) return null

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, PATCHES]} count={0} frustumCulled={false} renderOrder={-1}>
      <meshBasicMaterial color="#d8e4ec" transparent opacity={0.18 * visibility} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}
