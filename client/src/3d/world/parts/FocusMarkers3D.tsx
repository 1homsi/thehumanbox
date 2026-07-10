import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { OrganismState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  focus: string
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const MARKER_GEO = (() => {
  const g = new ConeGeometry(0.6, 1.1, 4)
  g.rotateX(Math.PI)
  return g
})()

const BEAM_GEO = (() => {
  const g = new CylinderGeometry(0.16, 0.3, 14, 6, 1, true)
  g.translate(0, 7, 0)
  return g
})()

const FOCUS_COLOR: Record<string, string> = {
  sick: '#8cff4c',
  hungry: '#ffa040',
  elders: '#ffcf6a',
  builders: '#6ec6ff',
  thriving: '#ffe066',
}

export function matchesFocus(focus: string, org: OrganismState): boolean {
  if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
  if (focus === 'sick') return org.infection > 0.15
  if (focus === 'hungry') return org.energy < 0.3
  if (focus === 'elders') return !!org.is_elder
  if (focus === 'builders')
    return !!(org.discoveries ?? []).some((d) =>
      ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
    )
  if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
  return false
}

const _mat = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3(1, 1, 1)
const _axisY = new Vector3(0, 1, 0)

export function FocusMarkers3D({ focus, organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const beamRef = useRef<InstancedMesh>(null)

  const matched = useMemo(
    () => organisms.filter((o) => o.alive && matchesFocus(focus, o)),
    [focus, organisms],
  )

  const focusColor = focus.startsWith('lineage:') ? '#ffffff' : (FOCUS_COLOR[focus] ?? '#ffffff')

  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(focusColor),
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [focusColor],
  )

  const beamMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(focusColor),
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [focusColor],
  )

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const beams = beamRef.current
    if (!mesh || !beams) return
    const t = clock.getElapsedTime()
    const bob = Math.sin(t * 3) * 0.18
    const count = Math.min(matched.length, 512)
    for (let i = 0; i < count; i++) {
      const o = matched[i]
      const [tx, ty] = getOrgXY(o.id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      _pos.set(tx * TILE_SCALE, groundY + 2.8 + bob, ty * TILE_SCALE)
      _quat.setFromAxisAngle(_axisY, t * 1.2)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)
      _pos.set(tx * TILE_SCALE, groundY, ty * TILE_SCALE)
      _quat.identity()
      _mat.compose(_pos, _quat, _scale)
      beams.setMatrixAt(i, _mat)
    }
    mesh.count = count
    beams.count = count
    mesh.instanceMatrix.needsUpdate = true
    beams.instanceMatrix.needsUpdate = true
  })

  if (matched.length === 0) return null

  const cap = Math.max(1, Math.min(matched.length, 512))
  return (
    <group>
      <instancedMesh
        ref={meshRef}
        key={`focus-${cap}`}
        args={[MARKER_GEO, material, cap]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={beamRef}
        key={`focusbeam-${cap}`}
        args={[BEAM_GEO, beamMaterial, cap]}
        frustumCulled={false}
      />
    </group>
  )
}
