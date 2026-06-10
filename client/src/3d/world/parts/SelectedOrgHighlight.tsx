import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Line,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
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
const DEST_RING_GEO = new TorusGeometry(0.85, 0.07, 5, 14)
const DOT_GEO = new SphereGeometry(0.14, 6, 5)

const TRAIL_LEN = 48
const TRAIL_SAMPLE_MS = 90
const PATH_DOTS = 22

const _dotMat = new Matrix4()
const _dotPos = new Vector3()
const _dotScale = new Vector3()
const _dotQuat = new Quaternion()

export function SelectedOrgHighlight({ organisms, depthMap, biomes }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const ringRef = useRef<Mesh>(null)
  const columnRef = useRef<Mesh>(null)
  const destRingRef = useRef<Mesh>(null)
  const dotsRef = useRef<InstancedMesh>(null)
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

    const destRing = destRingRef.current
    const dots = dotsRef.current
    if (destRing && dots) {
      const dtx = target.target_x
      const dty = target.target_y
      const distSq =
        dtx !== undefined && dty !== undefined ? (dtx - tx) * (dtx - tx) + (dty - ty) * (dty - ty) : 0
      if (dtx !== undefined && dty !== undefined && distSq > 4) {
        const dgy = heightAt(dtx, dty, depthMap, biomes)
        const dwx = dtx * TILE_SCALE
        const dwz = dty * TILE_SCALE
        destRing.visible = true
        destRing.position.set(dwx, dgy + 0.1, dwz)
        destRing.rotation.x = Math.PI / 2
        const dPulse = 1.0 + Math.sin(t * 4 + 1) * 0.22
        destRing.scale.set(dPulse, 1, dPulse)
        dots.visible = true
        const march = (t * 0.35) % 1
        for (let i = 0; i < PATH_DOTS; i++) {
          const f = (i / PATH_DOTS + march / PATH_DOTS) % 1
          const ix = tx + (dtx - tx) * f
          const iy = ty + (dty - ty) * f
          const gy = heightAt(ix, iy, depthMap, biomes)
          _dotPos.set(ix * TILE_SCALE, Math.max(gy, 0) + 0.5 + Math.sin(f * Math.PI) * 0.35, iy * TILE_SCALE)
          const fade = Math.sin(f * Math.PI)
          const s = 0.5 + fade * 0.7
          _dotScale.set(s, s, s)
          _dotMat.compose(_dotPos, _dotQuat, _dotScale)
          dots.setMatrixAt(i, _dotMat)
        }
        dots.instanceMatrix.needsUpdate = true
      } else {
        destRing.visible = false
        dots.visible = false
      }
    }

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
      <mesh ref={destRingRef} renderOrder={998} frustumCulled={false}>
        <primitive object={DEST_RING_GEO} attach="geometry" />
        <meshBasicMaterial color="#7fd4ff" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
      </mesh>
      <instancedMesh
        ref={dotsRef}
        args={[DOT_GEO, undefined, PATH_DOTS]}
        renderOrder={997}
        frustumCulled={false}
      >
        <meshBasicMaterial color="#9fe0ff" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

function geomDrawRange(geo: BufferGeometry, count: number) {
  geo.setDrawRange(0, count)
}
