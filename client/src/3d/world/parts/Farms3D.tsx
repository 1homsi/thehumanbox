import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, ConeGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

const ROWS_PER_FIELD = 6
const PLANTS_PER_ROW = 4
const tmp = new Object3D()
const _fcol = new Color()
const FIELD_GEO = new BoxGeometry(1, 0.12, 1)

// A tilled, crop-coloured ground patch per farm so croplands read as golden
// patchwork from above; the stalks below add detail up close.
function FieldPlanes({ buildings, depthMap, biomes }: Props) {
  const ref = useRef<InstancedMesh>(null)
  const fields = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; id: number }> = []
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.5) continue
      if (!FARMABLE.has(b.kind.toLowerCase())) continue
      const fw = b.fw ?? 1
      out.push({
        x: (b.x + fw + 1.8) * TILE_SCALE,
        y: heightAt(b.x + fw, b.y, depthMap, biomes) + 0.07,
        z: (b.y + 1.3) * TILE_SCALE,
        id: b.id,
      })
    }
    return out.slice(0, 500)
  }, [buildings, depthMap, biomes])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const h = (Math.imul(f.id, 2654435761) >>> 0) / 4294967295
      tmp.position.set(f.x, f.y, f.z)
      tmp.rotation.set(0, h * Math.PI, 0)
      tmp.scale.set(5 + h * 2.5, 1, 4.5 + h * 2)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
      // Wheat-gold to tilled-green, varied per field.
      _fcol.setRGB(0.52 + h * 0.18, 0.5 + h * 0.06, 0.24 + h * 0.05)
      m.setColorAt(i, _fcol)
    }
    m.count = fields.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [fields])

  if (fields.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[FIELD_GEO, undefined, Math.max(1, fields.length)]}
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial color="#ffffff" roughness={0.96} />
    </instancedMesh>
  )
}

function buildPlantGeo() {
  const stalk = new BoxGeometry(0.04, 0.4, 0.04)
  stalk.translate(0, 0.2, 0)
  const tassel = new ConeGeometry(0.07, 0.18, 5)
  tassel.translate(0, 0.49, 0)
  const merged = mergeGeometries([stalk, tassel])
  if (merged) merged.computeVertexNormals()
  return merged ?? stalk
}

const FARMABLE = new Set([
  'farm',
  'mill',
  'windmill',
  'watermill',
  'bakery',
  'silo',
  'granary',
  'orchard',
  'barn',
  'stable',
])

export function Farms3D({ buildings, depthMap, biomes }: Props) {
  const geo = useMemo(() => buildPlantGeo(), [])
  const matCrop = useMemo(() => new MeshStandardMaterial({ color: '#8caa48', roughness: 0.9 }), [])
  const meshRef = useRef<InstancedMesh>(null)

  const positions = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const result: Array<{ x: number; y: number; z: number; sway: number; height: number }> = []
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.5) continue
      if (!FARMABLE.has(b.kind.toLowerCase())) continue
      const fw = b.fw ?? 1
      const baseX = (b.x + fw + 1) * TILE_SCALE
      const baseZ = (b.y - 0.5) * TILE_SCALE
      const baseY = heightAt(b.x + fw, b.y, depthMap, biomes)
      for (let row = 0; row < ROWS_PER_FIELD; row++) {
        for (let p = 0; p < PLANTS_PER_ROW; p++) {
          const seed = (b.id * 31 + row * 7 + p * 13) % 1000
          const jx = ((seed % 100) - 50) * 0.005
          const jz = (((seed / 100) % 100) - 50) * 0.005
          const x = baseX + p * 0.4 + jx
          const z = baseZ + row * 0.6 + jz
          const sway = ((seed % 314) / 100) * 0.4
          const height = 0.75 + (seed % 30) / 100
          result.push({ x, y: baseY, z, sway, height })
        }
      }
    }
    return result.slice(0, 800)
  }, [buildings, depthMap, biomes])

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    const mesh = meshRef.current
    if (!mesh) return
    if (positions.length === 0) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const t = clock.getElapsedTime()
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      const breeze = Math.sin(t * 1.4 + p.sway) * 0.08
      tmp.position.set(p.x, p.y, p.z)
      tmp.rotation.set(breeze, 0, 0)
      tmp.scale.set(1, p.height, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <FieldPlanes buildings={buildings} depthMap={depthMap} biomes={biomes} />
      {positions.length > 0 && (
        <instancedMesh
          ref={meshRef}
          args={[geo, matCrop, Math.max(1, positions.length)]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
    </>
  )
}
