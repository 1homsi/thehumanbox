import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Line,
  Mesh,
  TorusGeometry,
} from 'three'
import type { OrganismState } from '../../../types'
import { useUIStore } from '../../../stores/store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const RING_GEO = new TorusGeometry(1.1, 0.09, 5, 16)
const COLUMN_GEO = new CylinderGeometry(0.18, 0.18, 60, 8, 1, true)

const TRAIL_LEN = 48
const TRAIL_SAMPLE_MS = 90

export function SelectedOrgHighlight({ organisms, depthMap, biomes }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const ringRef = useRef<Mesh>(null)
  const columnRef = useRef<Mesh>(null)
  // R3F's lowercase `<line>` JSX collides with SVGLineElement in
  // @types/react, so the JSX-element type resolves to SVG and rejects
  // three's `geometry`/`material` props. The runtime renderer
  // (@react-three/fiber) intercepts the element and creates a
  // three.Line. We type the ref as three.Line and suppress the
  // attribute-mismatch at the call site.
  const trailRef = useRef<Line | null>(null)
  const trailBuf = useRef<{ x: number; y: number; z: number }[]>([])
  const lastSample = useRef(0)

  const target = useMemo(
    () => organisms.find((o) => o.id === selectedOrgId && o.alive),
    [organisms, selectedOrgId],
  )

  useEffect(() => {
    trailBuf.current = []
    lastSample.current = 0
  }, [selectedOrgId])

  const trailGeo = useMemo(() => {
    const geo = new BufferGeometry()
    const positions = new Float32Array(TRAIL_LEN * 3)
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    return geo
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

    const now = performance.now()
    if (now - lastSample.current > TRAIL_SAMPLE_MS) {
      lastSample.current = now
      trailBuf.current.push({ x: px, y: groundY + 0.4, z: pz })
      if (trailBuf.current.length > TRAIL_LEN) {
        trailBuf.current.shift()
      }
      const pos = trailGeo.attributes.position as BufferAttribute
      const N = trailBuf.current.length
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
        <meshBasicMaterial color="#ffb455" transparent opacity={0.92} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={columnRef} renderOrder={997} frustumCulled={false}>
        <primitive object={COLUMN_GEO} attach="geometry" />
        <meshBasicMaterial
          color="#ffcc66"
          transparent
          opacity={0.18}
          toneMapped={false}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <line
        // @ts-expect-error R3F lowercase `<line>` collides with SVGLineElement; runtime is three.Line
        ref={trailRef}
        geometry={trailGeo}
        renderOrder={996}
        frustumCulled={false}
      >
        <lineBasicMaterial color="#ffcf6a" transparent opacity={0.65} depthWrite={false} toneMapped={false} />
      </line>
    </group>
  )
}

function geomDrawRange(geo: BufferGeometry, count: number) {
  geo.setDrawRange(0, count)
}
