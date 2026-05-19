import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
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
// No text matching — pure field-based relationships.
function connectionStrength(a: OrganismState, b: OrganismState): number {
  let s = 0
  if (a.partner_id === b.id || b.partner_id === a.id) s += 1.0   // partners
  if (a.parent_id  === b.id || b.parent_id  === a.id) s += 0.7   // parent-child
  if (a.lineage_id === b.lineage_id)                  s += 0.25  // same tribe
  if ((a.org_trust?.[b.id] ?? 0) > 0.6)              s += 0.4   // high trust
  if ((b.org_trust?.[a.id] ?? 0) > 0.6)              s += 0.4
  return s
}

const MAX_BEAMS   = 60
const BEAM_DIST   = 6   // tile units
const MIN_STRENGTH = 0.5

export function SocialBeams({ organisms, depthMap, biomes }: Props) {
  const geomRef  = useRef<THREE.BufferGeometry>(null)
  const matRef   = useRef<THREE.LineBasicMaterial>(null)
  const posArray = useMemo(() => new Float32Array(MAX_BEAMS * 6), [])

  useFrame(({ clock }) => {
    const geom = geomRef.current
    const mat  = matRef.current
    if (!geom || !mat) return

    const t     = clock.getElapsedTime()
    const alive = organisms.filter(o => o.alive)
    let n = 0

    outer: for (let i = 0; i < alive.length; i++) {
      const a = alive[i]
      const [ax, az] = getOrgXY(a.id)
      for (let j = i + 1; j < alive.length; j++) {
        if (n >= MAX_BEAMS) break outer
        const b = alive[j]
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
        n++
      }
    }

    const attr = geom.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    geom.setDrawRange(0, n * 2)

    // Heartbeat pulse driven by clock — not hardcoded timing
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
      </bufferGeometry>
      <lineBasicMaterial
        ref={matRef}
        color="#a8daff"
        transparent
        opacity={0.22}
        depthWrite={false}
      />
    </lineSegments>
  )
}
