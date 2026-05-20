import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AmbientLight, CylinderGeometry, InstancedMesh, Object3D } from 'three'
interface Props {
  kind:      'clear' | 'rain' | 'storm' | 'wet'
  intensity: number
}

function Lightning({ active }: { active: boolean }) {
  const lightRef = useRef<AmbientLight>(null)
  const nextStrike = useRef(performance.now() + 4000 + Math.random() * 6000)
  const strikeEnd  = useRef(0)

  useFrame(() => {
    if (!lightRef.current) return
    const now = performance.now()
    if (active && now >= nextStrike.current) {
      strikeEnd.current = now + 120
      nextStrike.current = now + 5000 + Math.random() * 12000
    }
    if (now < strikeEnd.current) {
      const t = (strikeEnd.current - now) / 120
      lightRef.current.intensity = t * 4.0
    } else {
      lightRef.current.intensity = 0
    }
  })

  if (!active) return null
  return <ambientLight ref={lightRef} color="#e8eeff" intensity={0} />
}

const tmp = new Object3D()

const RAIN_VOLUME = 80
const RAIN_HEIGHT = 60
const RAIN_GEO    = new CylinderGeometry(0.015, 0.015, 1.4, 4)

export function Weather({ kind, intensity }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const { camera } = useThree()

  const maxDrops = kind === 'storm' ? 2200 : kind === 'rain' ? 900 : 0
  const dropVelocity = kind === 'storm' ? 55 : 28

  const offsets = useMemo(() => {
    const arr = new Float32Array(maxDrops)
    for (let i = 0; i < maxDrops; i++) arr[i] = Math.random() * RAIN_HEIGHT
    return arr
  }, [maxDrops])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || maxDrops === 0) return
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z

    for (let i = 0; i < maxDrops; i++) {
      offsets[i] -= dropVelocity * delta
      if (offsets[i] < 0) offsets[i] += RAIN_HEIGHT

      const a = (i * 12.9898) % 1
      const b = (i * 78.233)  % 1
      const dx = (a - 0.5) * RAIN_VOLUME * 2
      const dz = (b - 0.5) * RAIN_VOLUME * 2
      const dy = offsets[i] - RAIN_HEIGHT * 0.5

      tmp.position.set(cx + dx, cy + dy, cz + dz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, intensity * (kind === 'storm' ? 1.6 : 1.0), 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = maxDrops
    mesh.instanceMatrix.needsUpdate = true
  })

  if (maxDrops === 0) {
    return <Lightning active={false} />
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[RAIN_GEO, undefined, maxDrops]}
        count={maxDrops}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={kind === 'storm' ? '#a8c0e0' : '#c4d4e8'}
          transparent
          opacity={Math.min(0.85, 0.35 + intensity * 0.5)}
        />
      </instancedMesh>
      <Lightning active={kind === 'storm'} />
    </>
  )
}
