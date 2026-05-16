import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrganismState } from '../types'
import { useUIStore } from '../store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Visual marker for the currently-selected org. A bright ring at
// their feet + a soft vertical column of light so the user can spot
// who they clicked even when zoomed out over the whole world.
//
// Lives at runtime (no React updates per tick); only re-renders
// when the selectedOrgId changes.
const RING_GEO   = new THREE.TorusGeometry(1.1, 0.09, 5, 16)
const COLUMN_GEO = new THREE.CylinderGeometry(0.18, 0.18, 60, 8, 1, true)

export function SelectedOrgHighlight({ organisms, depthMap, biomes }: Props) {
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const ringRef   = useRef<THREE.Mesh>(null)
  const columnRef = useRef<THREE.Mesh>(null)

  const target = useMemo(
    () => organisms.find(o => o.id === selectedOrgId && o.alive),
    [organisms, selectedOrgId],
  )

  useFrame(({ clock }) => {
    if (!target || !ringRef.current || !columnRef.current) return
    const t = clock.getElapsedTime()
    const [tx, ty] = getOrgXY(target.id)
    const groundY = heightAt(tx, ty, depthMap, biomes)
    const px = tx * TILE_SCALE
    const pz = ty * TILE_SCALE
    // Ring slightly above the ground so it doesn't z-fight terrain.
    ringRef.current.position.set(px, groundY + 0.08, pz)
    ringRef.current.rotation.x = Math.PI / 2
    const pulse = 1.0 + Math.sin(t * 3) * 0.18
    ringRef.current.scale.set(pulse, 1, pulse)
    // Light column overhead.
    columnRef.current.position.set(px, groundY + 30, pz)
  })

  if (!target) return null

  return (
    <group>
      <mesh ref={ringRef} renderOrder={998} frustumCulled={false}>
        <primitive object={RING_GEO} attach="geometry" />
        <meshBasicMaterial
          color="#ffb455"
          transparent
          opacity={0.92}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={columnRef} renderOrder={997} frustumCulled={false}>
        <primitive object={COLUMN_GEO} attach="geometry" />
        <meshBasicMaterial
          color="#ffcc66"
          transparent
          opacity={0.18}
          toneMapped={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
