import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width:  number
  height: number
}

// Two layers:
//   1. Outer ocean - HUGE plane (80000 x 80000) extending far past
//      the world. Eliminates the black void: fly off the world edge
//      and you see endless ocean instead of nothing.
//   2. World water - smaller, slightly shallower, in-bounds plane
//      that animates a subtle hue shift. Sits a hair below the outer
//      ocean so it doesn't z-fight.
export function Water({ width, height }: Props) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const t = clock.getElapsedTime()
    const s = Math.sin(t * 0.4) * 0.04
    matRef.current.color.setRGB(0.22 + s, 0.42 + s * 0.5, 0.62)
  })

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  return (
    <>
      {/* Outer ocean - far past world bounds, no void */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.4, cz]}
        receiveShadow
        frustumCulled={false}
      >
        <planeGeometry args={[OCEAN_EXTENT * 2, OCEAN_EXTENT * 2, 1, 1]} />
        <meshStandardMaterial
          color="#1f4870"
          transparent
          opacity={0.95}
          roughness={0.4}
          metalness={0.05}
        />
      </mesh>

      {/* Inner world water - lighter, slightly higher, animated */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.05, cz]}
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
    </>
  )
}
