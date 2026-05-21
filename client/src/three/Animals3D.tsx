import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { AnimalState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getAnimalXY, getAnimalHeading } from './motion-state'

interface Props {
  animals:  AnimalState[]
  depthMap: number[][]
  biomes:   number[][]
}

const KIND_TINT: Record<string, string> = {
  rabbit: '#cccccc',
  deer:   '#a8825a',
  boar:   '#6a5240',
  bird:   '#d4a040',
  fish:   '#88aaff',
  wolf:   '#555555',
  dog:    '#b08850',
}

function seededYaw(id: number): number {
  const x = ((id + 1) * 9301 + 49297) % 233280
  return (x / 233280) * Math.PI * 2
}

// A "part" is one InstancedMesh - geometry + material color + a local
// transform applied after the root translation/rotation/scale. We keep
// these declarative so a species is just an array of parts.
interface PartDef {
  geom: () => BufferGeometry
  color: string
  offset: [number, number, number]
  rot:    [number, number, number]
  // Most parts have unit scale baked into the geometry; if not, override.
  scale?: [number, number, number]
}

const TINT = (kind: string) => KIND_TINT[kind] ?? '#aa8855'

function makeSphere(r: number, w: number, h: number) {
  return new SphereGeometry(r, w, h)
}
function makeCapsule(r: number, l: number, cap: number, rad: number) {
  return new CapsuleGeometry(r, l, cap, rad)
}
function makeCylinder(rt: number, rb: number, h: number, seg: number) {
  return new CylinderGeometry(rt, rb, h, seg)
}
function makeBox(x: number, y: number, z: number) {
  return new BoxGeometry(x, y, z)
}
function makeCone(r: number, h: number, seg: number) {
  return new ConeGeometry(r, h, seg)
}

function buildPartsByKind(kind: AnimalState['kind']): PartDef[] {
  const tint = TINT(kind)
  switch (kind) {
    case 'rabbit': return [
      { geom: () => makeSphere(0.25, 6, 5), color: tint, offset: [0, 0.25, 0],     rot: [0,    0, 0] },
      { geom: () => makeSphere(0.16, 5, 5), color: tint, offset: [0, 0.55, 0.05],  rot: [0,    0, 0] },
      { geom: () => makeCylinder(0.025, 0.035, 0.28, 4), color: tint, offset: [-0.06, 0.78, 0.04], rot: [0.1, 0, -0.15] },
      { geom: () => makeCylinder(0.025, 0.035, 0.28, 4), color: tint, offset: [ 0.06, 0.78, 0.04], rot: [0.1, 0,  0.15] },
    ]
    case 'deer': return [
      // body
      { geom: () => makeCapsule(0.28, 0.6, 4, 6), color: tint, offset: [0, 0.8, 0], rot: [0, 0, 0] },
      // legs (dark) - 4
      { geom: () => makeCylinder(0.06, 0.05, 0.8, 4), color: '#3a2a1a', offset: [-0.18, 0.4,  0.35], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.8, 4), color: '#3a2a1a', offset: [ 0.18, 0.4,  0.35], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.8, 4), color: '#3a2a1a', offset: [-0.18, 0.4, -0.35], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.8, 4), color: '#3a2a1a', offset: [ 0.18, 0.4, -0.35], rot: [0,0,0] },
      // head
      { geom: () => makeSphere(0.22, 6, 5), color: tint, offset: [0, 1.2, 0.4], rot: [0,0,0] },
      // antlers
      { geom: () => makeCylinder(0.02, 0.04, 0.35, 3), color: '#6b4a2a', offset: [-0.1, 1.5, 0.4], rot: [0.4, 0, -0.4] },
      { geom: () => makeCylinder(0.02, 0.04, 0.35, 3), color: '#6b4a2a', offset: [ 0.1, 1.5, 0.4], rot: [0.4, 0,  0.4] },
    ]
    case 'boar': return [
      { geom: () => makeCapsule(0.32, 0.55, 4, 6), color: tint, offset: [0, 0.45, 0], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.35, 4), color: '#2a1a10', offset: [-0.16, 0.18,  0.28], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.35, 4), color: '#2a1a10', offset: [ 0.16, 0.18,  0.28], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.35, 4), color: '#2a1a10', offset: [-0.16, 0.18, -0.28], rot: [0,0,0] },
      { geom: () => makeCylinder(0.06, 0.05, 0.35, 4), color: '#2a1a10', offset: [ 0.16, 0.18, -0.28], rot: [0,0,0] },
      { geom: () => makeCone(0.18, 0.4, 5), color: tint, offset: [0, 0.55, 0.5], rot: [0,0,0] },
    ]
    case 'bird': return [
      { geom: () => makeSphere(0.16, 6, 5), color: tint, offset: [0, 1.3, 0], rot: [0,0,0] },
      { geom: () => makeBox(0.3, 0.04, 0.18), color: tint, offset: [-0.18, 1.32, 0], rot: [0, 0,  0.3] },
      { geom: () => makeBox(0.3, 0.04, 0.18), color: tint, offset: [ 0.18, 1.32, 0], rot: [0, 0, -0.3] },
      { geom: () => makeCone(0.04, 0.1, 4), color: '#d8a040', offset: [0, 1.32, 0.16], rot: [Math.PI / 2, 0, 0] },
    ]
    case 'wolf': return [
      { geom: () => makeCapsule(0.22, 0.7, 4, 6), color: tint, offset: [0, 0.55, 0], rot: [0,0,0] },
      { geom: () => makeCylinder(0.05, 0.04, 0.5, 4), color: tint, offset: [-0.14, 0.25,  0.32], rot: [0,0,0] },
      { geom: () => makeCylinder(0.05, 0.04, 0.5, 4), color: tint, offset: [ 0.14, 0.25,  0.32], rot: [0,0,0] },
      { geom: () => makeCylinder(0.05, 0.04, 0.5, 4), color: tint, offset: [-0.14, 0.25, -0.32], rot: [0,0,0] },
      { geom: () => makeCylinder(0.05, 0.04, 0.5, 4), color: tint, offset: [ 0.14, 0.25, -0.32], rot: [0,0,0] },
      { geom: () => makeSphere(0.17, 6, 5), color: tint, offset: [0, 0.75, 0.42], rot: [0,0,0] },
      { geom: () => makeCone(0.05, 0.12, 3), color: tint, offset: [-0.08, 0.92, 0.42], rot: [0, 0, -0.3] },
      { geom: () => makeCone(0.05, 0.12, 3), color: tint, offset: [ 0.08, 0.92, 0.42], rot: [0, 0,  0.3] },
    ]
    case 'fish': return [
      { geom: () => makeCone(0.18, 0.55, 5), color: tint, offset: [0, 0,  0],    rot: [Math.PI / 2, 0, 0] },
      { geom: () => makeCone(0.12, 0.2,  4), color: tint, offset: [0, 0, -0.28], rot: [Math.PI / 2, 0, 0] },
    ]
    default: return buildPartsByKind('rabbit')
  }
}

interface InstancedSpeciesProps {
  kind: AnimalState['kind']
  ids: number[]
  depthMap: number[][]
  biomes: number[][]
}

// Reused scratch - avoids per-frame allocation in useFrame.
const rootMat   = new Matrix4()
const partMat   = new Matrix4()
const finalMat  = new Matrix4()
const scratchEuler = new Euler()
const scratchQuat  = new Quaternion()
const scratchVec   = new Vector3()
const scratchScale = new Vector3(1, 1, 1)

function InstancedSpecies({ kind, ids, depthMap, biomes }: InstancedSpeciesProps) {
  const parts = useMemo(() => buildPartsByKind(kind), [kind])
  // One mesh per part. We size capacity to ids.length and let React
  // re-create instances when capacity changes (rare - populations move
  // slowly relative to render rate).
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const count = ids.length

  // Per-part baked local matrix (offset · rotation · scale). Computed
  // once per parts change, reused every frame.
  const partLocalMats = useMemo(() => {
    return parts.map(p => {
      const m = new Matrix4()
      scratchEuler.set(p.rot[0], p.rot[1], p.rot[2])
      scratchQuat.setFromEuler(scratchEuler)
      scratchVec.set(p.offset[0], p.offset[1], p.offset[2])
      const sc = p.scale ?? [1, 1, 1]
      scratchScale.set(sc[0], sc[1], sc[2])
      m.compose(scratchVec, scratchQuat, scratchScale)
      return m
    })
  }, [parts])

  // Per-instance breath phase (stable, seeded by id) so animals don't
  // breathe in lock-step.
  const breathPhases = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      arr[i] = ((ids[i] * 9301 + 49297) % 1000) / 1000 * Math.PI * 2
    }
    return arr
  }, [ids, count])

  // Last-frame position cache for derived heading fallback.
  const lastPos = useRef<Float32Array>(new Float32Array(count * 2))
  useEffect(() => {
    lastPos.current = new Float32Array(count * 2)
  }, [count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const lp = lastPos.current
    for (let i = 0; i < count; i++) {
      const id = ids[i]
      const [tx, ty] = getAnimalXY(id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const predicted = getAnimalHeading(id)
      let yaw: number
      if (predicted !== 0) {
        yaw = predicted
      } else {
        const lx = lp[i * 2], lz = lp[i * 2 + 1]
        const dx = tx - lx, dz = ty - lz
        if (dx * dx + dz * dz > 0.0005) {
          yaw = Math.atan2(dx, dz)
        } else {
          yaw = seededYaw(id)
        }
      }
      lp[i * 2]     = tx
      lp[i * 2 + 1] = ty

      const breath = 1 + Math.sin(t * 2.4 + breathPhases[i]) * 0.035

      // Root: T(world) · Ry(yaw) · S(1, breath, 1)
      scratchVec.set(tx * TILE_SCALE, groundY, ty * TILE_SCALE)
      scratchEuler.set(0, yaw, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchScale.set(1, breath, 1)
      rootMat.compose(scratchVec, scratchQuat, scratchScale)

      for (let p = 0; p < parts.length; p++) {
        const im = meshes.current[p]
        if (!im) continue
        partMat.copy(partLocalMats[p])
        finalMat.multiplyMatrices(rootMat, partMat)
        im.setMatrixAt(i, finalMat)
      }
    }
    for (let p = 0; p < parts.length; p++) {
      const im = meshes.current[p]
      if (im) im.instanceMatrix.needsUpdate = true
    }
  })

  if (count === 0) return null

  return (
    <>
      {parts.map((part, p) => (
        <instancedMesh
          // Key includes count so React recreates when capacity changes
          // (InstancedMesh capacity is fixed after construction).
          key={`${kind}-${p}-${count}`}
          ref={(m) => { meshes.current[p] = m }}
          args={[part.geom(), undefined, count]}
          castShadow
          frustumCulled={false}
        >
          <meshStandardMaterial color={part.color} roughness={0.85} />
        </instancedMesh>
      ))}
    </>
  )
}

export function Animals3D({ animals, depthMap, biomes }: Props) {
  const { scene, animations } = useGLTF('/models/fox.glb')

  // Group ids by kind. Stable order: source array order. We memoise
  // shallowly via animals identity - the wire merge layer keeps the
  // animals array stable across ticks when nothing changes.
  const byKind = useMemo(() => {
    const m = new Map<AnimalState['kind'], number[]>()
    for (const a of animals) {
      const arr = m.get(a.kind) ?? []
      if (arr.length === 0) m.set(a.kind, arr)
      arr.push(a.id)
    }
    return m
  }, [animals])

  if (!depthMap || !biomes) return null

  return (
    <>
      {Array.from(byKind.entries()).map(([kind, ids]) => {
        if (kind === 'dog') {
          // Skinned-mesh GLB - keep the per-instance AnimatedFigure
          // path (skinned-mesh instancing is a much bigger lift).
          return ids.map(id => {
            const yaw = seededYaw(id)
            const tint = TINT(kind)
            return (
              <AnimatedFigure
                key={`dog-${id}`}
                scene={scene}
                animations={animations}
                getPosition={() => {
                  const [tx, ty] = getAnimalXY(id)
                  const groundY = heightAt(tx, ty, depthMap, biomes)
                  return [tx * TILE_SCALE, groundY, ty * TILE_SCALE]
                }}
                getHeading={() => {
                  const h = getAnimalHeading(id)
                  return h !== 0 ? h : yaw
                }}
                rotationY={yaw}
                scale={0.012}
                animation="Walk"
                color={tint}
              />
            )
          })
        }
        return (
          <InstancedSpecies
            key={`species-${kind}`}
            kind={kind}
            ids={ids}
            depthMap={depthMap}
            biomes={biomes}
          />
        )
      })}
    </>
  )
}

useGLTF.preload('/models/fox.glb')
