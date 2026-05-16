import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width:  number
  height: number
}

// Two-layer water:
//
//   1. Outer ocean - flat huge plane (80000 x 80000), no waves.
//      Just kills the void past the world edges. Animates colour
//      slightly so it doesn't feel like a static painting.
//
//   2. Inner world water - subdivided plane that runs a multi-octave
//      sine displacement in a useFrame for moving wave crests. Limited
//      vertex count (60x30 subdivisions) so per-frame cost is small.
export function Water({ width, height }: Props) {
  const outerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const innerRef    = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (outerMatRef.current) {
      const s = Math.sin(t * 0.4) * 0.04
      outerMatRef.current.color.setRGB(0.16 + s, 0.32 + s * 0.5, 0.5)
    }
    // Animate inner water vertices for visible waves.
    const mesh = innerRef.current
    if (!mesh) return
    const geom = mesh.geometry as THREE.PlaneGeometry
    const pos = geom.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      // Multi-octave sine: two crossed waves at different frequencies
      // and speeds give a believable rolling-sea feel without a shader.
      const w = Math.sin(x * 0.03 + t * 0.7) * 0.18
              + Math.cos(y * 0.04 + t * 0.55) * 0.14
              + Math.sin((x + y) * 0.018 + t * 0.3) * 0.08
      pos.setZ(i, w)
    }
    pos.needsUpdate = true
    geom.computeVertexNormals()
  })

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  const innerGeo = useMemo(
    () => new THREE.PlaneGeometry(width * TILE_SCALE * 1.4, height * TILE_SCALE * 1.4, 60, 30),
    [width, height],
  )

  return (
    <>
      {/* Outer ocean - past the visible world bounds, kills the void */}
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

      {/* Inner world water - animated waves */}
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
          flatShading
        />
      </mesh>
    </>
  )
}
