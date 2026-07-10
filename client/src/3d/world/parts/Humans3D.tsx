import { useMemo, useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import {
  CapsuleGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OrganismState } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { useUIStore } from '../../../stores/store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { VillagerFigure } from './VillagerFigure'
import { workAnimFromThought } from './org-work'
import { getOrgXY, getOrgVelocityXY, getOrgHeading } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
  lineageEras?: Record<string, string>
}

// Cull radius for full skinned-mesh AnimatedFigure rendering. Past
// this distance we drop to an InstancedMesh capsule LOD - one draw
// call total for the entire far cohort.
const NEAR_RADIUS_SQ = 280 * 280
// Distance at which the AnimationMixer keeps ticking. Slightly tighter
// than NEAR so animation work also drops off before the mesh swap.
const ANIMATE_RADIUS_SQ = 220 * 220
// Hard cap on full skinned-mesh figures regardless of camera distance.
// Bounds worst-case CPU when the camera flies over a dense settlement.
const MAX_SKINNED = 80

// Data-driven: organism is inside their home when they're genuinely at rest
// Uses actual numeric fields - sleep_debt, energy - not thought text
function isInsideHouse(o: OrganismState): boolean {
  if (!o.home_x || !o.home_y) return false
  const dx = o.x - o.home_x
  const dy = o.y - o.home_y
  if (dx * dx + dy * dy >= 2.0) return false // not at home tile
  // Truly resting: either actually tired or energy-depleted
  return (o.sleep_debt ?? 0) > 0.4 || o.energy < 0.1 || o.health < 0.15 // too hurt to be outside
}

// Animation selected from actual organism state - fields first, thought text as weak fallback
function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'

  // Hard data overrides first
  if ((o.sleep_debt ?? 0) > 0.55 || o.energy < 0.08 || o.health < 0.12) return 'Sitting' // exhausted / incapacitated
  if (o.grief_ticks && o.grief_ticks > 10) return 'Sitting' // grief - subdued posture
  if ((o.fear_level ?? 0) > 0.8 && isMoving) return 'Running' // flight response from actual fear field
  if (o.infection > 0.55) return 'Sitting' // very sick → collapsed

  // Trait-influenced: highly aggressive organism swings more
  if ((o.traits?.aggression ?? 0) > 0.85 && isMoving) return 'Running'

  if (!isMoving) {
    const work = workAnimFromThought(o.thought || '')
    if (work) return work
  }

  // Thought text as fallback for actions that have no dedicated field
  const t = (o.thought || '').toLowerCase()
  if (t.includes('dance') || t.includes('celebrat') || t.includes('feast')) return 'Dance'
  if (t.includes('duel') || t.includes('punch') || t.includes('challeng') || t.includes('throw'))
    return 'Punch'
  if (t.includes('greet') || t.includes('wave') || t.includes('welcoming')) return 'Wave'
  if (t.includes('praising') || t.includes('blessing') || t.includes('coming-of-age')) return 'ThumbsUp'
  if (t.includes('yes')) return 'Yes'
  if (t.includes('no ')) return 'No'
  if (t.includes('flee') || t.includes('raid') || t.includes('ambush')) return 'Running'
  if (t.includes('rest') || t.includes('sleep') || t.includes('sit') || t.includes('meditat'))
    return 'Sitting'

  return isMoving ? 'Walking' : 'Idle'
}

// Color driven entirely by actual emotional/health state - no text matching
function orgColor(o: OrganismState): string {
  if (o.infection > 0.38) return 'hsl(85,  62%, 42%)' // sick: sickly green
  if ((o.fear_level ?? 0) > 0.72) return 'hsl(10,  72%, 38%)' // fear: deep red-orange
  if ((o.grief_ticks ?? 0) > 14) return 'hsl(220, 52%, 40%)' // grief: washed blue
  if (o.energy < 0.12) return 'hsl(38,  55%, 30%)' // starving: dark earth
  if (o.is_elder ?? false) return 'hsl(0, 0%, 78%)' // elder: silver hair
  if ((o.comfort ?? 0) > 0.82) return 'hsl(50,  80%, 58%)' // content: warm gold
  if ((o.traits?.aggression ?? 0) > 0.8) return 'hsl(0,   60%, 48%)' // aggressive: muted red
  const base = lineageColor(o.lineage_id)
  if (o.sex === 'female') {
    return tintHsl(base, 8, 0.95, 1.05) // female: slight warm shift
  }
  return base
}

// Figure size from life stage + per-individual variation, so a crowd reads as
// infants, children, adults and stooped elders of differing builds — not clones.
function figureScale(o: OrganismState): number {
  let s = 0.46
  switch (o.age_stage) {
    case 'infant':
      s = 0.22
      break
    case 'child':
      s = 0.3
      break
    case 'teen':
      s = 0.38
      break
    case 'elder':
      s = 0.41
      break
    case 'adult':
      s = 0.46
      break
    default:
      if (o.age < 500) s = 0.3
      else if (o.age < 900) s = 0.36
      else if (o.age > 3000) s = 0.42
  }
  if (o.is_elder && o.age_stage !== 'elder') s = 0.41
  if (o.pregnant) s *= 1.1
  const hh = o.id ? (o.id.charCodeAt(0) * 31 + o.id.charCodeAt(o.id.length - 1) * 7) % 100 : 50
  s *= 0.9 + (hh / 100) * 0.2
  s *= 0.88 + (o.traits?.resilience ?? 0.5) * 0.24
  s *= 0.85 + Math.min(1, o.health) * 0.15
  return s
}

function tintHsl(hslIn: string, dh: number, ds: number, dl: number): string {
  const m = /hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)/.exec(hslIn)
  if (!m) return hslIn
  const h = (parseFloat(m[1]) + dh + 360) % 360
  const s = Math.max(0, Math.min(100, parseFloat(m[2]) * ds))
  const l = Math.max(0, Math.min(100, parseFloat(m[3]) * dl))
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`
}

// Reused scratch - keeps the per-frame inner loop alloc-free.
const _mat = new Matrix4()
const _quat = new Quaternion()
const _euler = new Euler()
const _pos = new Vector3()
const _scale = new Vector3()
const _col = new Color()

/**
 * FarHumans: a single InstancedMesh of low-poly capsules covering all
 * organisms outside the near-camera radius. One draw call regardless
 * of cohort size. Per-instance colour comes from the same `orgColor`
 * function so distant organisms still telegraph their lineage / fear
 * / grief state without the cost of a skeletal mesh + mixer per org.
 */
const ERA_TINT: Record<string, [number, number, number, number]> = {
  'pre-stone': [0.42, 0.32, 0.22, 0.18],
  stone: [0.48, 0.42, 0.34, 0.2],
  bronze: [0.62, 0.42, 0.24, 0.22],
  iron: [0.37, 0.43, 0.46, 0.22],
  classical: [0.78, 0.66, 0.4, 0.22],
  medieval: [0.42, 0.25, 0.19, 0.26],
  renaissance: [0.54, 0.22, 0.28, 0.26],
  industrial: [0.23, 0.18, 0.14, 0.3],
  modern: [0.23, 0.29, 0.42, 0.3],
  information: [0.22, 0.47, 0.72, 0.34],
}

const _tintCol = new Color()

function applyEraTint(out: Color, eraName: string | undefined): void {
  if (!eraName) return
  const t = ERA_TINT[eraName]
  if (!t) return
  _tintCol.setRGB(t[0], t[1], t[2])
  out.lerp(_tintCol, t[3])
}

function buildHumanoidLodGeometry(): CapsuleGeometry {
  const Y_OFFSET = -0.09
  const torso = new CapsuleGeometry(0.16, 0.32, 4, 6)
  torso.translate(0, 0.16 + Y_OFFSET, 0)
  const head = new SphereGeometry(0.12, 8, 6)
  head.translate(0, 0.46 + Y_OFFSET, 0)
  const legL = new CapsuleGeometry(0.07, 0.22, 3, 4)
  legL.translate(-0.07, -0.18 + Y_OFFSET, 0)
  const legR = legL.clone()
  legR.translate(0.14, 0, 0)
  const armL = new CapsuleGeometry(0.055, 0.26, 3, 4)
  armL.translate(-0.2, 0.22 + Y_OFFSET, 0)
  const armR = armL.clone()
  armR.translate(0.4, 0, 0)
  const merged = mergeGeometries([torso, head, legL, legR, armL, armR])
  if (merged) merged.computeVertexNormals()
  return (merged ?? new CapsuleGeometry(0.18, 0.55, 4, 6)) as unknown as CapsuleGeometry
}

function FarHumans({
  organisms,
  depthMap,
  biomes,
  lineageEras,
}: {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
  lineageEras?: Record<string, string>
}) {
  const meshRef = useRef<InstancedMesh | null>(null)
  const geometry = useMemo(() => buildHumanoidLodGeometry(), [])
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85 }), [])
  const count = organisms.length

  useEffect(() => {
    // Re-create the InstancedMesh when capacity changes - three.js
    // bakes the instance count into the GPU buffer at construction.
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < count; i++) {
      const o = organisms[i]
      const [tx, ty] = getOrgXY(o.id)
      const [vx, vy] = getOrgVelocityXY(o.id)
      const speed = Math.sqrt(vx * vx + vy * vy)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const idHash = o.id ? o.id.charCodeAt(0) * 13 + o.id.charCodeAt(o.id.length - 1) : 0
      const phase = idHash * 0.1
      const bob = speed > 0.02 ? Math.abs(Math.sin(t * 12 + phase)) * Math.min(0.06, speed * 1.4) : 0
      _pos.set(tx * TILE_SCALE, groundY + 0.45 + bob, ty * TILE_SCALE)
      _euler.set(0, getOrgHeading(o.id), 0)
      _quat.setFromEuler(_euler)
      // Same per-org scale as the skinned figures so nothing snaps at the
      // LOD boundary.
      let s = figureScale(o)
      if (o.sex === 'female') s *= 0.97
      _scale.set(s, s, s)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)
      _col.set(orgColor(o))
      applyEraTint(_col, lineageEras?.[o.lineage_id])
      mesh.setColorAt(i, _col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      key={`far-${count}`}
      args={[geometry, material, count]}
      castShadow
      frustumCulled={false}
    />
  )
}

export function Humans3D({ organisms, depthMap, biomes, lineageEras }: Props) {
  const { camera } = useThree()
  const selectOrg = useUIStore((s) => s.selectOrg)
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)

  // Partition organisms by distance every render. Far cohort becomes
  // one InstancedMesh; near cohort renders full skinned figures with
  // the existing AnimatedFigure path. The selection always renders
  // as a skinned figure regardless of distance.
  const { near, far } = useMemo(() => {
    const near: OrganismState[] = []
    const far: OrganismState[] = []
    const ranked: { o: OrganismState; d: number }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      if (isInsideHouse(o)) continue
      const dx = o.x * TILE_SCALE - camera.position.x
      const dz = o.y * TILE_SCALE - camera.position.z
      const d = dx * dx + dz * dz
      if (o.id === selectedOrgId || d <= NEAR_RADIUS_SQ) {
        ranked.push({ o, d })
      } else {
        far.push(o)
      }
    }
    // Enforce a hard cap on skinned figures: keep the closest
    // MAX_SKINNED, demote the rest to the far cohort.
    ranked.sort((a, b) => a.d - b.d)
    for (let i = 0; i < ranked.length; i++) {
      if (i < MAX_SKINNED) near.push(ranked[i].o)
      else far.push(ranked[i].o)
    }
    return { near, far }
    // depMap/biomes intentionally omitted: only used inside child
    // components for height sampling, never in this partition.
  }, [organisms, camera.position.x, camera.position.z, selectedOrgId])

  const attentionById = useMemo(() => {
    const byId = new Map(organisms.filter((org) => org.alive).map((org) => [org.id, org]))
    const result = new Map<string, number>()
    const normalizeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
    for (const org of near) {
      const relatedIds = new Set<string>()
      if (org.partner_id) relatedIds.add(org.partner_id)
      if (org.parent_id) relatedIds.add(org.parent_id)
      for (const friendId of Object.keys(org.friends ?? {})) relatedIds.add(friendId)
      let closest: OrganismState | null = null
      let closestDistanceSq = 8 * 8
      for (const id of relatedIds) {
        const other = byId.get(id)
        if (!other) continue
        const dx = other.x - org.x
        const dy = other.y - org.y
        const distanceSq = dx * dx + dy * dy
        if (distanceSq < closestDistanceSq) {
          closestDistanceSq = distanceSq
          closest = other
        }
      }
      if (closest) {
        const worldYaw = Math.atan2(closest.x - org.x, closest.y - org.y)
        result.set(org.id, Math.max(-0.9, Math.min(0.9, normalizeAngle(worldYaw - getOrgHeading(org.id)))))
      }
    }
    return result
  }, [organisms, near])

  if (!depthMap || !biomes) return null

  return (
    <>
      {near.map((o) => {
        const [vx, vy] = getOrgVelocityXY(o.id)
        const speed = Math.hypot(vx, vy)
        const moving = speed > 0.05

        const scale = figureScale(o)

        const timeScale = Math.max(0.55, Math.min(2.4, 1.0 + speed * 1.4))
        const dx = o.x * TILE_SCALE - camera.position.x
        const dz = o.y * TILE_SCALE - camera.position.z
        const isSelected = o.id === selectedOrgId
        const animate = isSelected || dx * dx + dz * dz <= ANIMATE_RADIUS_SQ

        return (
          <group
            key={o.id}
            onClick={(e) => {
              e.stopPropagation()
              selectOrg(o.id)
            }}
          >
            <VillagerFigure
              org={o}
              era={lineageEras?.[o.lineage_id]}
              tunicColor={orgColor(o)}
              getPosition={() => {
                const [x, y] = getOrgXY(o.id)
                const groundY = heightAt(x, y, depthMap, biomes)
                return [x * TILE_SCALE, groundY, y * TILE_SCALE]
              }}
              getHeading={() => getOrgHeading(o.id)}
              scale={scale}
              animation={pickAnim(o, moving)}
              animate={animate}
              timeScale={timeScale}
              attentionYaw={attentionById.get(o.id)}
            />
          </group>
        )
      })}
      <FarHumans organisms={far} depthMap={depthMap} biomes={biomes} lineageEras={lineageEras} />
    </>
  )
}
