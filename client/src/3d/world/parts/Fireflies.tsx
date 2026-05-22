import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D, SphereGeometry } from 'three'
interface Props {
  hutPositions: [number, number, number][]
  isNight: boolean
}

const FIREFLY_COUNT = 120
const FIREFLY_GEO   = new SphereGeometry(0.09, 4, 3)
const tmp           = new Object3D()

export function Fireflies({ hutPositions, isNight }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const params = useMemo(() => {
    if (hutPositions.length === 0) return []
    return Array.from({ length: FIREFLY_COUNT }, (_, i) => {
      const hut = hutPositions[i % hutPositions.length]
      const s32 = ((i * 7919 + 6151) * 1664525 + 1013904223) >>> 0
      const spread = 10
      return {
        bx: hut[0] + (((s32 & 0xff) / 255) - 0.5) * spread * 2,
        by: hut[1] + 0.4 + ((s32 >>> 8 & 0xff) / 255) * 3.0,
        bz: hut[2] + (((s32 >>> 16 & 0xff) / 255) - 0.5) * spread * 2,
        fx: 0.28 + ((s32 >>> 4 & 0xf) / 16) * 0.35,
        fz: 0.22 + ((s32 >>> 8 & 0xf) / 16) * 0.30,
        fy: 0.12 + ((s32 >>> 12 & 0xf) / 16) * 0.20,
        ph: (i * 1.1737) % (Math.PI * 2),
        gp: (i * 0.7391) % (Math.PI * 2),
      }
    })
  }, [hutPositions])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!isNight || params.length === 0) {
      mesh.count = 0
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < params.length; i++) {
      const p = params[i]
      const x = p.bx + Math.sin(t * p.fx + p.ph) * 2.8
      const y = p.by + Math.sin(t * p.fy + p.ph * 0.7) * 0.9
      const z = p.bz + Math.cos(t * p.fz + p.ph * 1.3) * 2.8
      const flicker = 0.45 + Math.sin(t * 5.2 + p.gp) * 0.32
                    + Math.sin(t * 13.7 + p.gp * 1.4) * 0.18
      const s = Math.max(0, flicker)
      tmp.position.set(x, y, z)
      tmp.scale.setScalar(s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = params.length
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[FIREFLY_GEO, undefined, FIREFLY_COUNT]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#ccff30"
        transparent
        opacity={0.92}
        toneMapped={false}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
