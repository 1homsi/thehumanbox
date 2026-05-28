import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D, SphereGeometry, MeshBasicMaterial } from 'three'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

const INDUSTRIAL_KINDS = new Set([
  'forge',
  'workshop',
  'mill',
  'windmill',
  'watermill',
  'bakery',
  'pottery',
  'kiln',
  'smithy',
  'foundry',
  'factory',
])

const PUFFS_PER_STACK = 5
const MAX_STACKS = 80
const tmp = new Object3D()
const PUFF_GEO = new SphereGeometry(0.32, 6, 5)
const PUFF_MAT = new MeshBasicMaterial({
  color: '#8a7a6a',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  toneMapped: false,
})

export function IndustrySmoke({ buildings, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)

  const stacks = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; phase: number }> = []
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.6) continue
      if (!INDUSTRIAL_KINDS.has(b.kind.toLowerCase())) continue
      const fw = b.footprint?.[0] ?? 1
      const fh = b.footprint?.[1] ?? 1
      const wx = (b.x + fw / 2) * TILE_SCALE
      const wz = (b.y + fh / 2) * TILE_SCALE
      const wy = heightAt(b.x, b.y, depthMap, biomes) + 2.4
      out.push({ x: wx, y: wy, z: wz, phase: (b.id * 17) % 6.28 })
      if (out.length >= MAX_STACKS) break
    }
    return out
  }, [buildings, depthMap, biomes])

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    const mesh = meshRef.current
    if (!mesh) return
    if (stacks.length === 0) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    let inst = 0
    for (const s of stacks) {
      for (let p = 0; p < PUFFS_PER_STACK; p++) {
        const pt = ((t + s.phase + p * 0.8) % 4) / 4
        const rise = pt * 6
        const drift = Math.sin(t * 0.5 + s.phase + p) * 0.6 * pt
        const fade = (1 - pt) * 0.6 + 0.1
        tmp.position.set(s.x + drift, s.y + rise, s.z + drift * 0.6)
        tmp.scale.setScalar(0.5 + pt * 1.4)
        tmp.rotation.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst, tmp.matrix)
        inst++
        void fade
      }
    }
    mesh.count = inst
    mesh.instanceMatrix.needsUpdate = true
  })

  if (stacks.length === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[PUFF_GEO, PUFF_MAT, MAX_STACKS * PUFFS_PER_STACK]}
      frustumCulled={false}
      renderOrder={-1}
    />
  )
}
