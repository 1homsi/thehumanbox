import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width:    number
  height:   number
  depthMap?: number[][]
}

const SUB_X = 96
const SUB_Y = 48

export function Water({ width, height, depthMap }: Props) {
  const outerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const innerRef    = useRef<THREE.Mesh>(null)

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  const PLANE_W = width  * TILE_SCALE
  const PLANE_H = height * TILE_SCALE

  const { innerGeo, landMask } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, SUB_X, SUB_Y)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const mask = new Float32Array(pos.count)
    if (depthMap && depthMap.length) {
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i)
        const ly = pos.getY(i)
        const col = Math.floor((lx + PLANE_W / 2) / TILE_SCALE)
        const row = Math.floor((ly + PLANE_H / 2) / TILE_SCALE)
        const d = depthMap[Math.max(0, Math.min(height - 1, row))]
                          ?.[Math.max(0, Math.min(width - 1, col))]
                  ?? 255
        const isLand = d >= 254
        mask[i] = isLand ? 1 : 0
        if (isLand) {
          pos.setZ(i, -3.0)
        }
      }
      pos.needsUpdate = true
    } else {
      mask.fill(0)
    }
    const normals = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      normals[i * 3]     = 0
      normals[i * 3 + 1] = 0
      normals[i * 3 + 2] = 1
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    return { innerGeo: geo, landMask: mask }
  }, [PLANE_W, PLANE_H, width, height, depthMap])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (outerMatRef.current) {
      const s = Math.sin(t * 0.4) * 0.04
      outerMatRef.current.color.setRGB(0.16 + s, 0.32 + s * 0.5, 0.5)
    }
    const mesh = innerRef.current
    if (!mesh) return
    const geom = mesh.geometry as THREE.PlaneGeometry
    const pos = geom.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (landMask[i] > 0.5) {
        continue
      }
      const x = pos.getX(i)
      const y = pos.getY(i)
      const w = Math.sin(x * 0.04 + t * 0.7) * 0.12
              + Math.cos(y * 0.05 + t * 0.55) * 0.08
              + Math.sin((x + y) * 0.02 + t * 0.3) * 0.05
      pos.setZ(i, w)
    }
    pos.needsUpdate = true
  })

  return (
    <>
      {}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.6, cz]}
        receiveShadow
        frustumCulled={false}
      >
        <planeGeometry args={[OCEAN_EXTENT * 2, OCEAN_EXTENT * 2, 1, 1]} />
        <meshStandardMaterial
          ref={outerMatRef}
          color="#1f4870"
          transparent
          opacity={0.95}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {}
      <mesh
        ref={innerRef}
        rotation-x={-Math.PI / 2}
        position={[cx, -0.05, cz]}
        receiveShadow
        geometry={innerGeo}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#3a78ac"
          transparent
          opacity={0.82}
          roughness={0.18}
          metalness={0.15}
        />
      </mesh>
    </>
  )
}
