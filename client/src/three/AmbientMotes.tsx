import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  isNight?:    boolean
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
}

const MOTE_COUNT = 220
const MOTE_VOLUME = 26
const MOTE_GEO = new THREE.SphereGeometry(0.03, 3, 2)

const tmp = new THREE.Object3D()

export function AmbientMotes({ isNight = false, weatherKind = 'clear' }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()

  const active = !isNight && (weatherKind === 'clear' || weatherKind === 'wet')

  const params = useMemo(() => {
    const arr: { ox: number; oy: number; oz: number; freq: number; phase: number }[] = []
    for (let i = 0; i < MOTE_COUNT; i++) {
      arr.push({
        ox: (i * 0.6173) % 1 - 0.5,
        oy: (i * 0.3491) % 1 - 0.5,
        oz: (i * 0.8527) % 1 - 0.5,
        freq:  0.10 + ((i * 13) % 100) / 100 * 0.20,
        phase: (i * 1.1) % (Math.PI * 2),
      })
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!active) {
      for (let i = 0; i < MOTE_COUNT; i++) {
        tmp.position.set(0, -1000, 0)
        tmp.scale.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    for (let i = 0; i < MOTE_COUNT; i++) {
      const p = params[i]
      const x = cx + p.ox * MOTE_VOLUME * 2 + Math.sin(t * p.freq + p.phase) * 0.7
      const y = cy + p.oy * MOTE_VOLUME * 1.5 + Math.cos(t * p.freq * 1.3 + p.phase) * 0.5
      const z = cz + p.oz * MOTE_VOLUME * 2 + Math.cos(t * p.freq * 0.9 + p.phase) * 0.7
      tmp.position.set(x, y, z)
      tmp.scale.setScalar(1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[MOTE_GEO, undefined, MOTE_COUNT]}
      count={MOTE_COUNT}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#fff8d8"
        transparent
        opacity={0.35}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
