import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'

interface Props {
  width: number
  height: number
  dayProgress: number
}

const GULL_GEO = (() => {
  const left = new BoxGeometry(0.62, 0.06, 0.22)
  left.translate(-0.34, 0, 0)
  left.rotateZ(0.42)
  const right = new BoxGeometry(0.62, 0.06, 0.22)
  right.translate(0.34, 0, 0)
  right.rotateZ(-0.42)
  const body = new BoxGeometry(0.16, 0.1, 0.42)
  const g = mergeGeometries([left, right, body])
  g.scale(3.4, 3.4, 3.4)
  return g
})()

const GULL_MAT = new MeshStandardMaterial({
  color: '#2c2c33',
  roughness: 0.85,
  metalness: 0,
})

const FLOCKS = 6
const PER_FLOCK = 12
const TOTAL = FLOCKS * PER_FLOCK
const tmp = new Object3D()

export function Birds3D({ width, height, dayProgress }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const birds = useMemo(() => {
    const cx = width * TILE_SCALE * 0.5
    const cz = height * TILE_SCALE * 0.5
    const span = Math.max(width, height) * TILE_SCALE
    const arr: Array<{
      fcx: number
      fcz: number
      radius: number
      alt: number
      speed: number
      phase: number
      bob: number
    }> = []
    for (let f = 0; f < FLOCKS; f++) {
      const hx = ((f * 1327) % 1000) / 1000 - 0.5
      const hz = ((f * 2671) % 1000) / 1000 - 0.5
      const fcx = cx + hx * span * 0.55
      const fcz = cz + hz * span * 0.55
      const alt = 34 + ((f * 911) % 30)
      const dir = f % 2 === 0 ? 1 : -1
      for (let i = 0; i < PER_FLOCK; i++) {
        const seed = f * 100 + i
        arr.push({
          fcx,
          fcz,
          radius: 18 + ((seed * 53) % 26) + (i % 4) * 2.2,
          alt: alt + ((seed * 17) % 9) - 4,
          speed: dir * (0.16 + ((seed * 7) % 6) / 100),
          phase: ((seed * 131) % 628) / 100,
          bob: ((seed * 29) % 100) / 100,
        })
      }
    }
    return arr
  }, [width, height])

  const visible = (() => {
    const p = dayProgress
    if (p < 0.22 || p > 0.82) return 0
    if (p < 0.3) return (p - 0.22) / 0.08
    if (p > 0.74) return (0.82 - p) / 0.08
    return 1
  })()

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (visible <= 0) {
      mesh.count = 0
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      const ang = b.phase + t * b.speed
      const x = b.fcx + Math.cos(ang) * b.radius
      const z = b.fcz + Math.sin(ang) * b.radius
      const y = b.alt + Math.sin(t * 0.6 + b.bob * 6.28) * 2.2
      tmp.position.set(x, y, z)
      tmp.rotation.set(
        Math.sin(t * 1.4 + b.phase) * 0.12,
        -ang + (b.speed > 0 ? -Math.PI / 2 : Math.PI / 2),
        Math.sin(t * 2 + b.phase) * 0.28 * (b.speed > 0 ? 1 : -1),
      )
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = birds.length
    mesh.instanceMatrix.needsUpdate = true
  })

  if (visible <= 0) return null

  return <instancedMesh ref={meshRef} args={[GULL_GEO, GULL_MAT, TOTAL]} frustumCulled={false} />
}
