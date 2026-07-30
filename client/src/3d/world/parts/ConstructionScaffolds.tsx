import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

const tmp = new Object3D()
const SCAFFOLD_GEO = new BoxGeometry(1, 1, 1)
const SCAFFOLD_MAT = new MeshBasicMaterial({
  color: '#c8a875',
  transparent: true,
  opacity: 0.55,
  wireframe: true,
  depthWrite: false,
  toneMapped: false,
})

export function ConstructionScaffolds({ buildings, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const targets = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; height: number; progress: number; pulse: number }> =
      []
    for (const b of buildings) {
      const c = b.condition ?? 1
      if (c >= 1) continue
      const fw = b.fw ?? 1
      const fh = b.fh ?? 1
      const wx = (b.x + fw / 2) * TILE_SCALE
      const wz = (b.y + fh / 2) * TILE_SCALE
      const wy = heightAt(b.x, b.y, depthMap, biomes)
      const height = 6 + fw * 2 + fh * 1.5
      out.push({ x: wx, y: wy, z: wz, height, progress: c, pulse: Math.random() * Math.PI * 2 })
    }
    return out
  }, [buildings, depthMap, biomes])

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    const mesh = meshRef.current
    if (!mesh) return
    if (targets.length === 0) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < targets.length; i++) {
      const g = targets[i]
      const fillH = g.height * g.progress
      const bob = Math.sin(t * 1.2 + g.pulse) * 0.15
      tmp.position.set(g.x, g.y + fillH / 2 + bob, g.z)
      tmp.scale.set(2 + g.progress * 2, fillH, 2 + g.progress * 2)
      tmp.rotation.set(0, 0, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = targets.length
    mesh.instanceMatrix.needsUpdate = true
  })

  if (targets.length === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[SCAFFOLD_GEO, SCAFFOLD_MAT, Math.max(1, targets.length)]}
      frustumCulled={false}
      renderOrder={-1}
    />
  )
}
