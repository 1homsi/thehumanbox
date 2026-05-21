import { useMemo, useRef, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Vector3,
} from 'three'
import type { OrganismState } from '../types'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getOrgXY, getOrgVelocityXY, getOrgHeading } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

const NEAR_RADIUS_SQ = 280 * 280
const ANIMATE_RADIUS_SQ = 220 * 220
const MAX_SKINNED = 80

function isInsideHouse(o: OrganismState): boolean {
  if (!o.home_x || !o.home_y) return false
  const dx = o.x - o.home_x; const dy = o.y - o.home_y
  if (dx * dx + dy * dy >= 2.0) return false
  return (o.sleep_debt ?? 0) > 0.40
    || o.energy < 0.10
    || o.health < 0.15
}

function pickAnim(o: OrganismState, isMoving: boolean): string {
  if (!o.alive) return 'Death'
  if ((o.sleep_debt ?? 0) > 0.55 || o.energy < 0.08 || o.health < 0.12)
    return 'Sitting'
  if (o.grief_ticks && o.grief_ticks > 10)
    return 'Sitting'
  if ((o.fear_level ?? 0) > 0.80 && isMoving)
    return 'Running'
  if (o.infection > 0.55)
    return 'Sitting'
  if ((o.traits?.aggression ?? 0) > 0.85 && isMoving)
    return 'Running'
  const t = (o.thought || '').toLowerCase()
  if (t.includes('dance') || t.includes('celebrat') || t.includes('feast'))
    return 'Dance'
  if (t.includes('duel') || t.includes('punch') || t.includes('challeng') || t.includes('throw'))
    return 'Punch'
  if (t.includes('greet') || t.includes('wave') || t.includes('welcoming'))
    return 'Wave'
  if (t.includes('praising') || t.includes('blessing') || t.includes('coming-of-age'))
    return 'ThumbsUp'
  if (t.includes('yes')) return 'Yes'
  if (t.includes('no '))  return 'No'
  if (t.includes('flee') || t.includes('raid') || t.includes('ambush'))
    return 'Running'
  if (t.includes('rest') || t.includes('sleep') || t.includes('sit') || t.includes('meditat'))
    return 'Sitting'
  return isMoving ? 'Walking' : 'Idle'
}

type Sex = 'male' | 'female'
type AgeStage = 'infant' | 'child' | 'teen' | 'adult' | 'elder'

function orgSex(o: OrganismState): Sex {
  return o.sex === 'female' ? 'female' : 'male'
}

function orgAgeStage(o: OrganismState): AgeStage {
  if (o.age_stage) return o.age_stage
  if (o.age < 500)  return 'infant'
  if (o.age < 900)  return 'child'
  if (o.age < 1400) return 'teen'
  if (o.age > 3000 || o.is_elder) return 'elder'
  return 'adult'
}

function orgEra(o: OrganismState): string {
  return (o.era ?? o.lineage_era ?? 'stone').toLowerCase()
}

const AGE_SCALE: Record<AgeStage, number> = {
  infant: 0.40,
  child:  0.60,
  teen:   0.90,
  adult:  1.00,
  elder:  0.90,
}

function eraTint(era: string): Color | null {
  switch (era) {
    case 'stone':        return new Color('#7a6b55')
    case 'bronze':       return new Color('#a06a3c')
    case 'iron':         return new Color('#6a6e72')
    case 'medieval':     return new Color('#5a4030')
    case 'renaissance':  return new Color('#8a6b4a')
    case 'industrial':   return new Color('#3e2e22')
    case 'modern':       return new Color('#9aa0a8')
    case 'information':  return new Color('#aac0d0')
    default:             return null
  }
}

function orgColor(o: OrganismState): Color {
  const base = new Color()
  if (o.infection > 0.38)                      base.setStyle('hsl(85,  62%, 42%)')
  else if ((o.fear_level ?? 0) > 0.72)         base.setStyle('hsl(10,  72%, 38%)')
  else if ((o.grief_ticks ?? 0) > 14)          base.setStyle('hsl(220, 52%, 40%)')
  else if (o.energy < 0.12)                    base.setStyle('hsl(38,  55%, 30%)')
  else if ((o.comfort ?? 0) > 0.82)            base.setStyle('hsl(50,  80%, 58%)')
  else if ((o.traits?.aggression ?? 0) > 0.80) base.setStyle('hsl(0,   60%, 48%)')
  else                                         base.setStyle(lineageColor(o.lineage_id))
  const tint = eraTint(orgEra(o))
  if (tint) base.lerp(tint, 0.28)
  const stage = orgAgeStage(o)
  if (stage === 'infant' || stage === 'child') base.lerp(new Color('#ffffff'), 0.18)
  else if (stage === 'elder')                  base.lerp(new Color('#222222'), 0.15)
  return base
}

const _mat   = new Matrix4()
const _quat  = new Quaternion()
const _euler = new Euler()
const _pos   = new Vector3()
const _scale = new Vector3()

const SEXES: Sex[] = ['male', 'female']
const STAGES: AgeStage[] = ['infant', 'child', 'teen', 'adult', 'elder']

function buildBodyGeometry(sex: Sex): BufferGeometry {
  const radius = sex === 'female' ? 0.16 : 0.20
  const length = sex === 'female' ? 0.58 : 0.55
  return new CapsuleGeometry(radius, length, 4, 6)
}

const ERA_ACCESSORY: Record<string, string> = {
  stone:        'none',
  bronze:       'tri',
  iron:         'tri',
  medieval:     'hood',
  renaissance:  'tricorn',
  industrial:   'tophat',
  modern:       'cap',
  information:  'disc',
}

function buildAccessoryGeometry(kind: string): BufferGeometry | null {
  switch (kind) {
    case 'tri':     return new ConeGeometry(0.18, 0.22, 8)
    case 'hood':    return new ConeGeometry(0.20, 0.32, 8)
    case 'tricorn': return new ConeGeometry(0.26, 0.10, 3)
    case 'tophat':  return new CylinderGeometry(0.14, 0.14, 0.22, 10)
    case 'cap':     return new CylinderGeometry(0.18, 0.18, 0.08, 12)
    case 'disc':    return new CircleGeometry(0.14, 14)
    default:        return null
  }
}

const ACCESSORY_COLOR: Record<string, string> = {
  tri:     '#b58a4a',
  hood:    '#3a2a20',
  tricorn: '#1a1208',
  tophat:  '#0a0a0a',
  cap:     '#1a4a8a',
  disc:    '#88aacc',
}

function FarHumans({ organisms, depthMap, biomes }: {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes:   number[][]
}) {
  const groups = useMemo(() => {
    const map: Record<string, OrganismState[]> = {}
    for (const sex of SEXES) {
      for (const stage of STAGES) {
        map[`${sex}_${stage}`] = []
      }
    }
    for (const o of organisms) {
      const key = `${orgSex(o)}_${orgAgeStage(o)}`
      map[key].push(o)
    }
    return map
  }, [organisms])

  const accessoryGroups = useMemo(() => {
    const map: Record<string, OrganismState[]> = {}
    for (const o of organisms) {
      const acc = ERA_ACCESSORY[orgEra(o)] ?? 'none'
      if (acc === 'none') continue
      if (!map[acc]) map[acc] = []
      map[acc].push(o)
    }
    return map
  }, [organisms])

  return (
    <>
      {SEXES.flatMap(sex => STAGES.map(stage => {
        const key = `${sex}_${stage}`
        const bucket = groups[key]
        if (!bucket || bucket.length === 0) return null
        return (
          <BodyInstances
            key={key}
            sex={sex}
            stage={stage}
            organisms={bucket}
            depthMap={depthMap}
            biomes={biomes}
          />
        )
      }))}
      {Object.entries(accessoryGroups).map(([kind, bucket]) => (
        <AccessoryInstances
          key={kind}
          kind={kind}
          organisms={bucket}
          depthMap={depthMap}
          biomes={biomes}
        />
      ))}
    </>
  )
}

function BodyInstances({ sex, stage, organisms, depthMap, biomes }: {
  sex: Sex
  stage: AgeStage
  organisms: OrganismState[]
  depthMap: number[][]
  biomes:   number[][]
}) {
  const meshRef = useRef<InstancedMesh | null>(null)
  const geometry = useMemo(() => buildBodyGeometry(sex), [sex])
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85 }), [])
  const count = organisms.length
  const stageScale = AGE_SCALE[stage]
  const isElder = stage === 'elder'

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const o = organisms[i]
      const [tx, ty] = getOrgXY(o.id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const baseS = (sex === 'female' ? 0.42 : 0.45) * stageScale
      let s = baseS
      if (o.pregnant) s *= 1.10
      s *= 0.88 + (o.traits?.resilience ?? 0.5) * 0.24
      s *= 0.85 + Math.min(1, o.health) * 0.15
      const sx = sex === 'female' ? s * 0.86 : s
      _pos.set(tx * TILE_SCALE, groundY + 0.45 * stageScale, ty * TILE_SCALE)
      const stoop = isElder ? 0.18 : 0
      _euler.set(stoop, getOrgHeading(o.id), 0)
      _quat.setFromEuler(_euler)
      _scale.set(sx, s, sx)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)
      mesh.setColorAt(i, orgColor(o))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      key={`${sex}-${stage}-${count}`}
      args={[geometry, material, count]}
      castShadow
      frustumCulled={false}
    />
  )
}

function AccessoryInstances({ kind, organisms, depthMap, biomes }: {
  kind: string
  organisms: OrganismState[]
  depthMap: number[][]
  biomes:   number[][]
}) {
  const meshRef = useRef<InstancedMesh | null>(null)
  const geometry = useMemo(() => buildAccessoryGeometry(kind) ?? new BoxGeometry(0.01, 0.01, 0.01), [kind])
  const material = useMemo(() => new MeshStandardMaterial({
    color: ACCESSORY_COLOR[kind] ?? '#888',
    roughness: 0.7,
  }), [kind])
  const count = organisms.length

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.needsUpdate = true
  }, [count])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const o = organisms[i]
      const [tx, ty] = getOrgXY(o.id)
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const stage = orgAgeStage(o)
      const stageScale = AGE_SCALE[stage]
      const baseS = (orgSex(o) === 'female' ? 0.42 : 0.45) * stageScale
      let s = baseS
      if (o.pregnant) s *= 1.10
      s *= 0.88 + (o.traits?.resilience ?? 0.5) * 0.24
      s *= 0.85 + Math.min(1, o.health) * 0.15
      const headY = groundY + (0.45 + 0.55) * stageScale + (kind === 'disc' ? 0.05 : 0.08)
      _pos.set(tx * TILE_SCALE, headY, ty * TILE_SCALE)
      const lay = kind === 'disc' ? -Math.PI / 2 : 0
      _euler.set(lay, getOrgHeading(o.id), 0)
      _quat.setFromEuler(_euler)
      _scale.set(s, s, s)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      key={`acc-${kind}-${count}`}
      args={[geometry, material, count]}
      castShadow
      frustumCulled={false}
    />
  )
}

const MALE_CLIP_MAP: Record<string, string> = {
  Walking: 'walk', Running: 'run', Idle: 'idle',
  Sitting: 'sad_pose', Death: 'sad_pose',
  Yes: 'agree', No: 'headShake',
  Wave: 'agree', ThumbsUp: 'agree',
  Dance: 'run', Punch: 'run', Jump: 'run',
  WalkJump: 'walk', Standing: 'idle',
}

const FEMALE_CLIP_MAP: Record<string, string> = {
  Walking: 'Walk', Running: 'Run', Idle: 'Idle',
  Sitting: 'Idle', Death: 'Idle',
  Yes: 'Idle', No: 'Idle',
  Wave: 'Idle', ThumbsUp: 'Idle',
  Dance: 'Run', Punch: 'Run', Jump: 'Run',
  WalkJump: 'Walk', Standing: 'Idle',
}

export function Humans3D({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const selectOrg     = useUIStore(s => s.selectOrg)
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const male   = useGLTF('/models/human_male.glb')
  const female = useGLTF('/models/human_female.glb')

  const { near, far } = useMemo(() => {
    const near: OrganismState[] = []
    const far:  OrganismState[] = []
    const ranked: { o: OrganismState; d: number }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      if (isInsideHouse(o)) continue
      const dx = o.x * TILE_SCALE - camera.position.x
      const dz = o.y * TILE_SCALE - camera.position.z
      const d  = dx * dx + dz * dz
      if (o.id === selectedOrgId || d <= NEAR_RADIUS_SQ) {
        ranked.push({ o, d })
      } else {
        far.push(o)
      }
    }
    ranked.sort((a, b) => a.d - b.d)
    for (let i = 0; i < ranked.length; i++) {
      if (i < MAX_SKINNED) near.push(ranked[i].o)
      else                 far.push(ranked[i].o)
    }
    return { near, far }
  }, [organisms, camera.position.x, camera.position.z, selectedOrgId])

  if (!depthMap || !biomes) return null

  return (
    <>
      {near.map(o => {
        const [vx, vy] = getOrgVelocityXY(o.id)
        const speed  = Math.hypot(vx, vy)
        const moving = speed > 0.05

        const isFemale = o.sex === 'female'
        const baseScale = isFemale ? 0.42 : 0.45
        const stage = orgAgeStage(o)
        const stageScale = AGE_SCALE[stage]

        let scale = baseScale * stageScale
        if (o.pregnant) scale *= 1.10
        scale *= 0.88 + (o.traits?.resilience ?? 0.5) * 0.24
        scale *= 0.85 + Math.min(1, o.health) * 0.15

        const timeScale = Math.max(0.55, Math.min(2.4, 1.0 + speed * 1.4))
        const dx = o.x * TILE_SCALE - camera.position.x
        const dz = o.y * TILE_SCALE - camera.position.z
        const isSelected = o.id === selectedOrgId
        const animate = isSelected || dx * dx + dz * dz <= ANIMATE_RADIUS_SQ

        const requested = pickAnim(o, moving)
        const map = isFemale ? FEMALE_CLIP_MAP : MALE_CLIP_MAP
        const clipName = map[requested] ?? (isFemale ? 'Idle' : 'idle')
        const modelScene      = isFemale ? female.scene      : male.scene
        const modelAnimations = isFemale ? female.animations : male.animations

        return (
          <group
            key={o.id}
            onClick={(e) => {
              e.stopPropagation()
              selectOrg(o.id)
            }}
          >
            <AnimatedFigure
              scene={modelScene}
              animations={modelAnimations}
              getPosition={() => {
                const [x, y] = getOrgXY(o.id)
                const groundY = heightAt(x, y, depthMap, biomes)
                return [x * TILE_SCALE, groundY, y * TILE_SCALE]
              }}
              getHeading={() => getOrgHeading(o.id)}
              scale={scale}
              animation={clipName}
              color={'#' + orgColor(o).getHexString()}
              animate={animate}
              timeScale={timeScale}
            />
          </group>
        )
      })}
      <FarHumans organisms={far} depthMap={depthMap} biomes={biomes} />
    </>
  )
}

useGLTF.preload('/models/human_male.glb')
useGLTF.preload('/models/human_female.glb')
