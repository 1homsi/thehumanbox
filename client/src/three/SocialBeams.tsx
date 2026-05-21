import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, LineBasicMaterial } from 'three'
import type { OrganismState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Beam fires when organisms are genuinely connected by actual relational data.
// No text matching - pure field-based relationships.
function connectionStrength(a: OrganismState, b: OrganismState): number {
  let s = 0
  if (a.partner_id === b.id || b.partner_id === a.id) s += 1.0   // partners
  if (a.parent_id  === b.id || b.parent_id  === a.id) s += 0.7   // parent-child
  if (a.friends?.[b.id])                              s += 0.65  // named friend
  if (b.friends?.[a.id])                              s += 0.35  // reciprocal
  if (a.lineage_id === b.lineage_id)                  s += 0.20  // same tribe
  if ((a.org_trust?.[b.id] ?? 0) > 0.6)              s += 0.3   // high trust
  if ((b.org_trust?.[a.id] ?? 0) > 0.6)              s += 0.3
  return s
}

// RGB triplet per beam type - vertex colors so each segment can differ
function beamRGB(a: OrganismState, b: OrganismState): [number, number, number] {
  if (a.partner_id === b.id || b.partner_id === a.id) return [1.0, 0.69, 0.82]  // partners: pink
  if (a.friends?.[b.id] || b.friends?.[a.id])         return [1.0, 0.82, 0.44]  // friends: amber
  return [0.66, 0.85, 1.0]                                                        // kin: blue-white
}

const MAX_BEAMS    = 60
const BEAM_DIST    = 6   // tile units
const MIN_STRENGTH = 0.5

export function SocialBeams({ organisms, depthMap, biomes }: Props) {
  const geomRef    = useRef<BufferGeometry>(null)
  const matRef     = useRef<LineBasicMaterial>(null)
  const posArray   = useMemo(() => new Float32Array(MAX_BEAMS * 6), [])
  const colorArray = useMemo(() => new Float32Array(MAX_BEAMS * 6), [])  // RGB per vertex
  const frameCount = useRef(0)
  const beamCount  = useRef(0)  // stable across throttled frames

  useFrame(({ clock }) => {
    const geom = geomRef.current
    const mat  = matRef.current
    if (!geom || !mat) return

    const t = clock.getElapsedTime()

    // Heavy O(N^2) pair recompute only every 4 frames; in between, the
    // previously written posArray/colorArray + draw range are reused.
    if (frameCount.current % 4 === 0) {
      let n = 0
      const orgs = organisms
      const len  = orgs.length

      outer: for (let i = 0; i < len; i++) {
        const a = orgs[i]
        if (!a.alive) continue
        const [ax, az] = getOrgXY(a.id)
        for (let j = i + 1; j < len; j++) {
          if (n >= MAX_BEAMS) break outer
          const b = orgs[j]
          if (!b.alive) continue
          const [bx, bz] = getOrgXY(b.id)
          const ddx = ax - bx; const ddz = az - bz
          if (ddx * ddx + ddz * ddz > BEAM_DIST * BEAM_DIST) continue
          const str = connectionStrength(a, b)
          if (str < MIN_STRENGTH) continue
          const agy = heightAt(ax, az, depthMap, biomes)
          const bgy = heightAt(bx, bz, depthMap, biomes)
          const base = n * 6
          posArray[base + 0] = ax * TILE_SCALE
          posArray[base + 1] = agy + 1.5
          posArray[base + 2] = az * TILE_SCALE
          posArray[base + 3] = bx * TILE_SCALE
          posArray[base + 4] = bgy + 1.5
          posArray[base + 5] = bz * TILE_SCALE

          const [r, g, bv] = beamRGB(a, b)
          colorArray[base + 0] = r;  colorArray[base + 1] = g;  colorArray[base + 2] = bv
          colorArray[base + 3] = r;  colorArray[base + 4] = g;  colorArray[base + 5] = bv
          n++
        }
      }

      beamCount.current = n
      const posAttr = geom.getAttribute('position') as BufferAttribute
      posAttr.needsUpdate = true
      const colAttr = geom.getAttribute('color') as BufferAttribute
      colAttr.needsUpdate = true
      geom.setDrawRange(0, n * 2)
    } else {
      // Keep the previously computed draw range stable.
      geom.setDrawRange(0, beamCount.current * 2)
    }

    frameCount.current++

    // Heartbeat pulse driven by clock (still per-frame for smooth animation)
    mat.opacity = 0.18 + Math.sin(t * 2.2) * 0.10
  })

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[posArray, 3]}
          count={MAX_BEAMS * 2}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colorArray, 3]}
          count={MAX_BEAMS * 2}
        />
      </bufferGeometry>
      <lineBasicMaterial
        ref={matRef}
        vertexColors
        transparent
        opacity={0.22}
        depthWrite={false}
      />
    </lineSegments>
  )
}
