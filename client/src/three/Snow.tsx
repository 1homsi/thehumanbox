import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  active:   boolean
  intensity?: number
}

const SNOW_VOLUME = 70
const SNOW_HEIGHT = 50
const SNOW_GEO = new THREE.SphereGeometry(0.05, 4, 3)

const tmp = new THREE.Object3D()

export function Snow({ active, intensity = 0.6 }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()

  const maxFlakes = active ? Math.round(1100 * intensity) : 0

  const offsets = useMemo(() => {
    const arr = new Float32Array(maxFlakes)
    for (let i = 0; i < maxFlakes; i++) arr[i] = Math.random() * SNOW_HEIGHT
    return arr
  }, [maxFlakes])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || maxFlakes === 0) return
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z

    for (let i = 0; i < maxFlakes; i++) {
      offsets[i] -= 4 * delta * intensity
      if (offsets[i] < 0) offsets[i] += SNOW_HEIGHT

      const a = (i * 12.9898) % 1
      const b = (i * 78.233)  % 1
      const swayPhase = (i * 0.071) + offsets[i] * 0.13
      const sway = Math.sin(swayPhase) * 1.6
      const dx = (a - 0.5) * SNOW_VOLUME * 2 + sway
      const dz = (b - 0.5) * SNOW_VOLUME * 2 + Math.cos(swayPhase) * 1.6
      const dy = offsets[i] - SNOW_HEIGHT * 0.5

      tmp.position.set(cx + dx, cy + dy, cz + dz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(1 + (i * 0.011 % 0.6))
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = maxFlakes
    mesh.instanceMatrix.needsUpdate = true
  })

  if (maxFlakes === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[SNOW_GEO, undefined, maxFlakes]}
      count={maxFlakes}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#f3f6ff" transparent opacity={0.8} />
    </instancedMesh>
  )
}
