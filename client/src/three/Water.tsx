import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  width:  number
  height: number
}

// Water plane covering the whole world at y=0. Sits flush with land;
// submerged terrain (negative y) is visible through the semi-transparent
// surface. Slow uv pan + scaled-down sin wave gives the impression of
// motion without needing a normal map (Phase 4 adds proper shader).
export function Water({ width, height }: Props) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }) => {
    if (!matRef.current) return
    // Subtle hue shift over time gives "this is alive water" without
    // expensive shader work. A real shader replaces this in Phase 4.
    const t = clock.getElapsedTime()
    const shimmer = Math.sin(t * 0.4) * 0.04
    matRef.current.color.setRGB(0.22 + shimmer, 0.42 + shimmer * 0.5, 0.62)
  })

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[width * TILE_SCALE * 0.5, -0.05, height * TILE_SCALE * 0.5]}
      receiveShadow
    >
      <planeGeometry args={[width * TILE_SCALE * 1.4, height * TILE_SCALE * 1.4]} />
      <meshStandardMaterial
        ref={matRef}
        color="#3870a0"
        transparent
        opacity={0.78}
        roughness={0.15}
        metalness={0.05}
      />
    </mesh>
  )
}
