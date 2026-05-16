import { useEffect, useMemo, useRef } from 'react'
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

// Recent-path trail: a polyline of recent positions, alpha-fading
// from oldest -> newest. Helps you see where the selected org has
// been walking.
const TRAIL_LEN = 48
const TRAIL_SAMPLE_MS = 90   // sample interval per point

export function SelectedOrgHighlight({ organisms, depthMap, biomes }: Props) {
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const ringRef   = useRef<THREE.Mesh>(null)
  const columnRef = useRef<THREE.Mesh>(null)
  const trailRef  = useRef<THREE.Line | null>(null)
  // Circular buffer of recent positions.
  const trailBuf  = useRef<{ x: number; y: number; z: number }[]>([])
  const lastSample = useRef(0)

  const target = useMemo(
    () => organisms.find(o => o.id === selectedOrgId && o.alive),
    [organisms, selectedOrgId],
  )

  // Reset trail when the selection changes.
  useEffect(() => {
    trailBuf.current = []
    lastSample.current = 0
  }, [selectedOrgId])

  // Build the trail line geometry once. Per-vertex colours alpha-fade
  // from old (transparent) to new (opaque orange). We mutate the
  // BufferAttribute in useFrame.
  const trailGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(TRAIL_LEN * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(({ clock }) => {
    if (!target || !ringRef.current || !columnRef.current) return
    const t = clock.getElapsedTime()
    const [tx, ty] = getOrgXY(target.id)
    const groundY = heightAt(tx, ty, depthMap, biomes)
    const px = tx * TILE_SCALE
    const pz = ty * TILE_SCALE
    ringRef.current.position.set(px, groundY + 0.08, pz)
    ringRef.current.rotation.x = Math.PI / 2
    const pulse = 1.0 + Math.sin(t * 3) * 0.18
    ringRef.current.scale.set(pulse, 1, pulse)
    columnRef.current.position.set(px, groundY + 30, pz)

    // Sample position into the trail buffer at a fixed interval.
    const now = performance.now()
    if (now - lastSample.current > TRAIL_SAMPLE_MS) {
      lastSample.current = now
      trailBuf.current.push({ x: px, y: groundY + 0.4, z: pz })
      if (trailBuf.current.length > TRAIL_LEN) {
        trailBuf.current.shift()
      }
      // Write to the line geometry. Older points stay near the start
      // (transparent), newer points at the end (opaque).
      const pos = trailGeo.attributes.position as THREE.BufferAttribute
      const N = trailBuf.current.length
      // Fill with first sample if buffer is short so all verts have a value.
      const first = trailBuf.current[0]
      for (let i = 0; i < TRAIL_LEN; i++) {
        const src = i < N ? trailBuf.current[i] : first
        pos.setXYZ(i, src.x, src.y, src.z)
      }
      pos.needsUpdate = true
      geomDrawRange(trailGeo, N)
    }
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
      <line
        // @ts-expect-error - drei/three's intrinsic 'line' element ref type
        ref={trailRef}
        geometry={trailGeo}
        renderOrder={996}
        frustumCulled={false}
      >
        <lineBasicMaterial
          color="#ffcf6a"
          transparent
          opacity={0.65}
          depthWrite={false}
          toneMapped={false}
        />
      </line>
    </group>
  )
}

function geomDrawRange(geo: THREE.BufferGeometry, count: number) {
  geo.setDrawRange(0, count)
}
