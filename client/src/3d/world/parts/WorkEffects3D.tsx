import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three'
import type { OrganismState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

type WorkKind = 'wood' | 'stone' | 'farm' | 'fish' | 'build'

const WORK_COLOR: Record<WorkKind, string> = {
  wood: '#b07840',
  stone: '#a8a8a8',
  farm: '#c8b050',
  fish: '#7fb4e8',
  build: '#d8c080',
}

function workKind(thought: string): WorkKind | null {
  const t = thought.toLowerCase()
  if (t.includes('chop') || t.includes('gathering wood') || t.includes('timber')) return 'wood'
  if (t.includes('mining') || t.includes('gathering stone') || t.includes('quarry')) return 'stone'
  if (t.includes('fishing') || t.includes('caught a fish')) return 'fish'
  if (t.includes('harvest') || t.includes('planting') || t.includes('digging')) return 'farm'
  if (t.includes('build') || t.includes('construct')) return 'build'
  return null
}

const MAX_WORKERS = 28
const PARTICLES_PER = 5
const TOTAL = MAX_WORKERS * PARTICLES_PER
const CYCLE_S = 0.7
const RANGE_SQ = 220 * 220

const GEO = new PlaneGeometry(0.16, 0.16)
const _mat = new Matrix4()
const _pos = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _col = new Color()

function hash01(n: number): number {
  let h = (n * 2654435761) >>> 0
  h = ((h ^ (h >>> 13)) * 0x5bd1e995) >>> 0
  return (h & 0xffff) / 0xffff
}

export function WorkEffects3D({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => GEO, [])

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    _quat.copy(camera.quaternion)

    let slot = 0
    for (const o of organisms) {
      if (slot >= MAX_WORKERS) break
      if (!o.alive) continue
      const kind = workKind(o.thought || '')
      if (!kind) continue
      const dx = o.x * TILE_SCALE - camera.position.x
      const dz = o.y * TILE_SCALE - camera.position.z
      if (dx * dx + dz * dz > RANGE_SQ) continue

      const [tx, ty] = getOrgXY(o.id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const wx = tx * TILE_SCALE
      const wz = ty * TILE_SCALE
      _col.set(WORK_COLOR[kind])
      const seed = o.id ? o.id.charCodeAt(0) * 31 + o.id.charCodeAt(o.id.length - 1) : 1

      for (let i = 0; i < PARTICLES_PER; i++) {
        const idx = slot * PARTICLES_PER + i
        const isLeaf = kind === 'wood' && i >= 3
        if (isLeaf) {
          const phase = (t / (CYCLE_S * 2.6) + hash01(seed + i * 53)) % 1
          const ang = hash01(seed + i * 17) * Math.PI * 2
          const sway = Math.sin(t * 2.2 + i * 2.1) * 0.45
          const r = 0.5 + hash01(seed + i * 41) * 0.9
          _pos.set(
            wx + Math.cos(ang) * r + sway,
            groundY + 4.6 - phase * 4.2,
            wz + Math.sin(ang) * r + Math.cos(t * 1.7 + i) * 0.3,
          )
          const s = 0.8 + hash01(seed + i * 23) * 0.5
          _scale.set(s, s, s)
          _mat.compose(_pos, _quat, _scale)
          mesh.setMatrixAt(idx, _mat)
          _col.set(hash01(seed + i * 11) < 0.5 ? '#4f8a3a' : '#6aa848')
          mesh.setColorAt(idx, _col)
          _col.set(WORK_COLOR[kind])
          continue
        }
        const phase = (t / CYCLE_S + hash01(seed + i * 97)) % 1
        const ang = hash01(seed + i * 13) * Math.PI * 2
        const r = 0.25 + phase * (0.7 + hash01(seed + i * 7) * 0.5)
        const isFish = kind === 'fish'
        const baseY = isFish ? groundY + 0.25 : groundY + 1.1
        const arcY = isFish
          ? Math.sin(phase * Math.PI) * 0.6
          : Math.sin(phase * Math.PI) * 0.9 - phase * phase * 1.1
        _pos.set(wx + Math.cos(ang) * r, baseY + arcY, wz + Math.sin(ang) * r)
        const s = (1 - phase) * (0.7 + hash01(seed + i * 29) * 0.6)
        _scale.set(s, s, s)
        _mat.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(idx, _mat)
        mesh.setColorAt(idx, _col)
      }
      slot++
    }

    for (let idx = slot * PARTICLES_PER; idx < TOTAL; idx++) {
      _pos.set(0, -1000, 0)
      _scale.set(0, 0, 0)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(idx, _mat)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, TOTAL]} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.9} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}
