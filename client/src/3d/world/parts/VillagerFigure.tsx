import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { OrganismState } from '../../../types'
import { toolFromThought, type OrgAccessory } from './org-work'

const GEO = {
  head: new SphereGeometry(0.5, 10, 8),
  torso: new CylinderGeometry(0.34, 0.52, 1.05, 8),
  skirt: new CylinderGeometry(0.52, 0.62, 0.35, 8),
  limb: new CapsuleGeometry(0.11, 0.46, 3, 6),
  leg: new CapsuleGeometry(0.13, 0.4, 3, 6),
  hood: new ConeGeometry(0.56, 0.72, 8),
  hair: new SphereGeometry(0.52, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.46),
  bun: new SphereGeometry(0.16, 6, 6),
  beard: new ConeGeometry(0.3, 0.5, 6),
  eye: new SphereGeometry(0.055, 6, 6),
  belly: new SphereGeometry(0.32, 8, 6),
  staff: new CylinderGeometry(0.045, 0.055, 1.7, 6),
  orb: new SphereGeometry(0.13, 8, 8),
  spearShaft: new CylinderGeometry(0.035, 0.035, 1.5, 6),
  spearTip: new ConeGeometry(0.09, 0.26, 6),
  belt: new TorusGeometry(0.45, 0.05, 6, 10),
  circlet: new TorusGeometry(0.42, 0.035, 6, 12),
  cloak: new ConeGeometry(0.68, 1.25, 8, 1, true),
  axeHead: new BoxGeometry(0.08, 0.3, 0.42),
  pickHead: new ConeGeometry(0.07, 0.5, 5),
  rod: new CylinderGeometry(0.025, 0.04, 2.0, 5),
  log: new CylinderGeometry(0.13, 0.13, 1.05, 6),
  rock: new SphereGeometry(0.22, 6, 5),
  sack: new SphereGeometry(0.27, 7, 6),
  pack: new BoxGeometry(0.62, 0.72, 0.42),
  packLid: new BoxGeometry(0.66, 0.22, 0.46),
  strap: new BoxGeometry(0.09, 0.78, 0.07),
  cane: new CylinderGeometry(0.035, 0.045, 1.5, 5),
}

const matCache = new Map<string, MeshStandardMaterial>()
function mat(color: string, emissive = 0): MeshStandardMaterial {
  const key = `${color}|${emissive}`
  let m = matCache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    })
    if (emissive > 0) {
      m.emissive = new Color(color)
      m.emissiveIntensity = emissive
    }
    matCache.set(key, m)
  }
  return m
}

function idHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const SKIN_TONES = ['#e8b88a', '#d9a06e', '#c98a58', '#a96c42', '#8a5430', '#f0c9a0']
const HAIR_TONES = ['#2a1c10', '#4a2e16', '#6e4520', '#8a6438', '#1c1c22', '#5a3c2a']

type EraTier = 'primal' | 'tribal' | 'civic' | 'advanced'

function eraTier(era?: string): EraTier {
  switch (era) {
    case 'pre-stone':
    case 'stone':
      return 'primal'
    case 'bronze':
    case 'iron':
      return 'tribal'
    case 'classical':
    case 'medieval':
      return 'civic'
    default:
      return era ? 'advanced' : 'primal'
  }
}

type AgeStage = 'infant' | 'child' | 'teen' | 'adult' | 'elder'

interface Look {
  tier: EraTier
  stage: AgeStage
  skin: string
  hairColor: string
  hood: boolean
  hair: boolean
  bun: boolean
  beard: boolean
  belt: boolean
  circlet: boolean
  cloak: boolean
  skirt: boolean
  accessory: OrgAccessory
  belly: boolean
  build: number
  pack: boolean
  cane: boolean
}

function ageStageOf(org: OrganismState): AgeStage {
  if (org.age_stage) return org.age_stage
  if (org.is_elder) return 'elder'
  const a = org.age
  const frac = org.max_age ? a / org.max_age : a / 4000
  if (frac < 0.06) return 'infant'
  if (frac < 0.16) return 'child'
  if (frac < 0.28) return 'teen'
  if (frac > 0.8) return 'elder'
  return 'adult'
}

function hasStuff(org: OrganismState): boolean {
  if (org.carrying > 0) return true
  const inv = org.inventory
  if (inv) {
    for (const k in inv) if (inv[k] > 0) return true
  }
  return false
}

function deriveLook(org: OrganismState, era?: string): Look {
  const h = idHash(org.id)
  const tier = eraTier(era)
  const stage = ageStageOf(org)
  const elder = stage === 'elder'
  const young = stage === 'infant' || stage === 'child'
  const female = org.sex === 'female'
  const spec = (org.specialty ?? '').toLowerCase()
  let accessory: Look['accessory'] = 'none'
  const activeTool = toolFromThought(org.thought ?? '')
  if (activeTool) accessory = activeTool
  else if (spec.includes('smith') || spec.includes('mason')) accessory = 'hammer'
  else if (spec.includes('farm')) accessory = 'hoe'
  else if (tier === 'primal' && (h & 3) === 0) accessory = 'spear'
  const forager =
    spec.includes('forag') ||
    spec.includes('gather') ||
    spec.includes('hunt') ||
    spec.includes('trad') ||
    spec.includes('porter') ||
    spec.includes('builder')
  const buildBase = 0.86 + (((h >> 7) % 100) / 100) * 0.3
  return {
    tier,
    stage,
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hairColor: elder ? '#cfcfcf' : HAIR_TONES[(h >> 3) % HAIR_TONES.length],
    hood: tier === 'civic' && (h & 1) === 0,
    hair: true,
    bun: female && (h & 2) === 0,
    beard: !female && !young && (elder || (h & 7) === 0),
    belt: tier !== 'primal' && !young,
    circlet: !young && (tier === 'advanced' || (tier === 'civic' && (h & 4) === 0)),
    cloak: tier !== 'primal' && !young && ((h >> 5) & 1) === 0,
    skirt: female || tier === 'civic' || tier === 'advanced',
    accessory,
    belly: !!org.pregnant,
    build: female ? buildBase * 0.93 : buildBase,
    pack: org.carrying > 0 || (forager && hasStuff(org)) || (forager && (h & 1) === 0),
    cane: elder && (h & 1) === 0,
  }
}

interface Props {
  org: OrganismState
  era?: string
  tunicColor: string
  getPosition: () => [number, number, number]
  getHeading?: () => number
  scale?: number
  animation: string
  animate?: boolean
  timeScale?: number
  attentionYaw?: number
}

export function VillagerFigure({
  org,
  era,
  tunicColor,
  getPosition,
  getHeading,
  scale = 1,
  animation,
  animate = true,
  timeScale = 1,
  attentionYaw,
}: Props) {
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const cloak = useRef<Group>(null)
  const clock = useRef(idHash(org.id) % 100)

  const look = useMemo(() => deriveLook(org, era), [org, era])
  const tunic = useMemo(() => mat(tunicColor), [tunicColor])
  const tunicDark = useMemo(
    () => mat('#' + new Color(tunicColor).multiplyScalar(0.72).getHexString()),
    [tunicColor],
  )
  const skin = mat(look.skin)
  const hairM = mat(look.hairColor)

  const grief = (org.grief_ticks ?? 0) > 14
  const afraid = (org.fear_level ?? 0) > 0.6

  useFrame((_, dt) => {
    if (!root.current) return
    const [x, y, z] = getPosition()
    root.current.position.set(x, y, z)
    if (getHeading) root.current.rotation.y = getHeading()

    if (!animate || !body.current) return
    clock.current += dt * timeScale
    const t = clock.current

    let legSwing = 0
    let armSwing = 0
    let bob = 0
    let lean = 0
    let crouch = 0
    let headPitch = 0
    let headYaw = 0
    let armLUp = 0
    let armRUp = 0
    let spin = 0

    switch (animation) {
      case 'Running': {
        legSwing = Math.sin(t * 11) * 0.85
        armSwing = -Math.sin(t * 11) * 0.7
        bob = Math.abs(Math.sin(t * 11)) * 0.08
        lean = 0.28
        break
      }
      case 'Walking': {
        legSwing = Math.sin(t * 6.5) * 0.5
        armSwing = -Math.sin(t * 6.5) * 0.35
        bob = Math.abs(Math.sin(t * 6.5)) * 0.04
        lean = 0.08
        break
      }
      case 'Sitting': {
        crouch = 0.45
        legSwing = 1.35
        headPitch = 0.25
        armLUp = 0.25
        armRUp = 0.25
        break
      }
      case 'Dance': {
        bob = Math.abs(Math.sin(t * 7)) * 0.14
        armLUp = 2.4 + Math.sin(t * 7) * 0.5
        armRUp = 2.4 - Math.sin(t * 7) * 0.5
        spin = Math.sin(t * 3.5) * 0.5
        legSwing = Math.sin(t * 7) * 0.25
        break
      }
      case 'Punch': {
        armRUp = 1.4 + Math.max(0, Math.sin(t * 9)) * 0.6
        lean = 0.12
        break
      }
      case 'Chop': {
        const swing = Math.sin(t * 6)
        armRUp = 1.6 + swing * 0.9
        armLUp = 1.3 + swing * 0.8
        lean = 0.18 + Math.max(0, -swing) * 0.14
        bob = Math.abs(swing) * 0.03
        break
      }
      case 'Fish': {
        armRUp = 0.95
        armLUp = 0.2
        lean = 0.06
        bob = Math.sin(t * 1.4) * 0.02
        headPitch = 0.18
        break
      }
      case 'Wave': {
        armRUp = 2.6
        armSwing = Math.sin(t * 8) * 0.3
        break
      }
      case 'ThumbsUp': {
        armRUp = 1.8
        break
      }
      case 'Yes': {
        headPitch = Math.sin(t * 6) * 0.3
        break
      }
      case 'No': {
        headYaw = Math.sin(t * 6) * 0.45
        break
      }
      case 'Death': {
        crouch = 0.85
        headPitch = 0.6
        break
      }
      default: {
        bob = Math.sin(t * 1.8) * 0.015
        armSwing = Math.sin(t * 1.8) * 0.05
        headYaw = attentionYaw ?? Math.sin(t * 0.4 + 1.7) * 0.2
        break
      }
    }

    if (org.carrying > 0) {
      // Hauling a load: hunch forward and bring both arms up to steady it.
      lean = Math.max(lean, 0.17)
      armLUp = Math.max(armLUp, 0.5)
      armRUp = Math.max(armRUp, 0.5)
    }
    if (look.stage === 'elder') {
      // Stooped posture and a bowed head read instantly as old age.
      lean += 0.18
      headPitch += 0.14
    }
    if (grief) {
      headPitch += 0.35
      armLUp = Math.min(armLUp, 0.1)
      armRUp = Math.min(armRUp, 0.1)
      bob *= 0.4
    }
    if (afraid) {
      crouch = Math.max(crouch, 0.18)
      headYaw += Math.sin(t * 5) * 0.12
    }

    body.current.position.y = bob - crouch * 0.55
    body.current.rotation.x = lean
    body.current.rotation.y = spin
    if (legL.current) legL.current.rotation.x = legSwing
    if (legR.current) legR.current.rotation.x = -legSwing
    if (armL.current) {
      armL.current.rotation.x = armSwing
      armL.current.rotation.z = 0.18 + armLUp
    }
    if (armR.current) {
      armR.current.rotation.x = -armSwing
      armR.current.rotation.z = -0.18 - armRUp
    }
    if (head.current) {
      head.current.rotation.x = headPitch
      head.current.rotation.y = headYaw
    }
    if (cloak.current) {
      cloak.current.rotation.x = -0.12 - Math.abs(legSwing) * 0.25 - Math.sin(t * 2.2) * 0.03
    }
  })

  return (
    <group ref={root} scale={[scale, scale, scale]}>
      <group ref={body} position={[0, 0, 0]} scale={[look.build, 1, look.build]}>
        <group ref={legL} position={[0.18, 0.62, 0]}>
          <mesh geometry={GEO.leg} material={tunicDark} position={[0, -0.3, 0]} />
        </group>
        <group ref={legR} position={[-0.18, 0.62, 0]}>
          <mesh geometry={GEO.leg} material={tunicDark} position={[0, -0.3, 0]} />
        </group>

        <mesh geometry={GEO.torso} material={tunic} position={[0, 1.1, 0]} castShadow />
        {look.skirt && <mesh geometry={GEO.skirt} material={tunic} position={[0, 0.62, 0]} />}
        {look.belt && (
          <mesh
            geometry={GEO.belt}
            material={tunicDark}
            position={[0, 0.92, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        )}
        {look.belly && <mesh geometry={GEO.belly} material={tunic} position={[0, 1.0, 0.28]} />}
        {look.cloak && (
          <group ref={cloak} position={[0, 1.55, -0.12]}>
            <mesh geometry={GEO.cloak} material={tunicDark} position={[0, -0.55, -0.1]} />
          </group>
        )}

        <group ref={armL} position={[0.42, 1.52, 0]}>
          <mesh geometry={GEO.limb} material={skin} position={[0, -0.32, 0]} />
        </group>
        <group ref={armR} position={[-0.42, 1.52, 0]}>
          <mesh geometry={GEO.limb} material={skin} position={[0, -0.32, 0]} />
          {look.accessory === 'staff' && (
            <group position={[0, -0.62, 0.12]}>
              <mesh geometry={GEO.staff} material={mat('#5a4226')} position={[0, 0.45, 0]} />
              <mesh geometry={GEO.orb} material={mat('#7fd4ff', 1.6)} position={[0, 1.36, 0]} />
            </group>
          )}
          {look.accessory === 'spear' && (
            <group position={[0, -0.62, 0.12]}>
              <mesh geometry={GEO.spearShaft} material={mat('#6e4a28')} position={[0, 0.4, 0]} />
              <mesh geometry={GEO.spearTip} material={mat('#9a9a9a')} position={[0, 1.25, 0]} />
            </group>
          )}
          {look.accessory === 'hammer' && (
            <group position={[0, -0.62, 0.12]} rotation={[0.5, 0, 0]}>
              <mesh
                geometry={GEO.spearShaft}
                material={mat('#6e4a28')}
                position={[0, 0.2, 0]}
                scale={[1, 0.55, 1]}
              />
              <mesh
                geometry={GEO.belly}
                material={mat('#777777')}
                position={[0, 0.65, 0]}
                scale={[0.55, 0.4, 0.55]}
              />
            </group>
          )}
          {look.accessory === 'hoe' && (
            <group position={[0, -0.62, 0.12]} rotation={[0.35, 0, 0]}>
              <mesh geometry={GEO.spearShaft} material={mat('#6e4a28')} position={[0, 0.4, 0]} />
              <mesh
                geometry={GEO.spearTip}
                material={mat('#8a7a5a')}
                position={[0, 1.2, 0.05]}
                rotation={[1.2, 0, 0]}
              />
            </group>
          )}
          {look.accessory === 'axe' && (
            <group position={[0, -0.62, 0.12]} rotation={[0.4, 0, 0]}>
              <mesh
                geometry={GEO.spearShaft}
                material={mat('#6e4a28')}
                position={[0, 0.32, 0]}
                scale={[1.2, 0.75, 1.2]}
              />
              <mesh geometry={GEO.axeHead} material={mat('#9aa0a6')} position={[0, 0.82, 0.16]} />
            </group>
          )}
          {look.accessory === 'pickaxe' && (
            <group position={[0, -0.62, 0.12]} rotation={[0.4, 0, 0]}>
              <mesh
                geometry={GEO.spearShaft}
                material={mat('#6e4a28')}
                position={[0, 0.32, 0]}
                scale={[1.2, 0.75, 1.2]}
              />
              <mesh
                geometry={GEO.pickHead}
                material={mat('#8a8f94')}
                position={[0, 0.82, 0.22]}
                rotation={[Math.PI / 2, 0, 0]}
              />
              <mesh
                geometry={GEO.pickHead}
                material={mat('#8a8f94')}
                position={[0, 0.82, -0.22]}
                rotation={[-Math.PI / 2, 0, 0]}
              />
            </group>
          )}
          {look.accessory === 'rod' && (
            <group position={[0, -0.62, 0.12]} rotation={[0.9, 0, 0]}>
              <mesh geometry={GEO.rod} material={mat('#7a5a34')} position={[0, 0.8, 0]} />
              <mesh geometry={GEO.eye} material={mat('#dddddd')} position={[0, 1.78, 0]} />
            </group>
          )}
        </group>

        {look.pack && (
          <group position={[0, 1.18, -0.42]}>
            <mesh geometry={GEO.pack} material={mat('#6b4a2a')} castShadow />
            <mesh geometry={GEO.packLid} material={mat('#553c20')} position={[0, 0.34, 0.02]} />
            <mesh
              geometry={GEO.strap}
              material={mat('#4a3018')}
              position={[0.22, 0.18, 0.4]}
              rotation={[0.2, 0, 0.12]}
            />
            <mesh
              geometry={GEO.strap}
              material={mat('#4a3018')}
              position={[-0.22, 0.18, 0.4]}
              rotation={[0.2, 0, -0.12]}
            />
          </group>
        )}

        {look.cane && (
          <group position={[0.52, 1.5, 0.16]} rotation={[0.06, 0, 0.05]}>
            <mesh geometry={GEO.cane} material={mat('#5a4226')} position={[0, -0.75, 0]} />
          </group>
        )}

        {org.carrying > 0 && (
          <group position={[0, 1.62, -0.46]} rotation={[0.22, 0, 0]}>
            {org.carrying_type === 2 ? (
              <>
                <mesh geometry={GEO.rock} material={mat('#8e8e8e')} position={[0.12, 0, 0]} />
                <mesh geometry={GEO.rock} material={mat('#7a7a7a')} position={[-0.14, 0.1, 0]} />
                <mesh
                  geometry={GEO.rock}
                  material={mat('#828282')}
                  position={[0.02, 0.22, -0.05]}
                  scale={[0.8, 0.8, 0.8]}
                />
              </>
            ) : org.carrying_type === 1 ? (
              <group rotation={[0, 0, 0.32]}>
                <mesh
                  geometry={GEO.log}
                  material={mat('#7a5230')}
                  position={[0, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                />
                <mesh
                  geometry={GEO.log}
                  material={mat('#6a4628')}
                  position={[0, 0.2, 0.02]}
                  rotation={[0, 0, Math.PI / 2]}
                />
                <mesh
                  geometry={GEO.log}
                  material={mat('#835a36')}
                  position={[0, 0.1, -0.18]}
                  rotation={[0, 0, Math.PI / 2]}
                />
              </group>
            ) : (
              <mesh geometry={GEO.sack} material={mat('#b09060')} scale={[1.1, 0.95, 0.8]} />
            )}
          </group>
        )}

        <group ref={head} position={[0, 2.08, 0]}>
          <mesh geometry={GEO.head} material={skin} castShadow />
          <mesh geometry={GEO.eye} material={mat('#1a1410')} position={[0.18, 0.06, 0.44]} />
          <mesh geometry={GEO.eye} material={mat('#1a1410')} position={[-0.18, 0.06, 0.44]} />
          {look.hood ? (
            <mesh geometry={GEO.hood} material={tunicDark} position={[0, 0.3, -0.03]} />
          ) : (
            <>
              <mesh geometry={GEO.hair} material={hairM} position={[0, 0.16, 0]} />
              {look.bun && <mesh geometry={GEO.bun} material={hairM} position={[0, 0.42, -0.32]} />}
            </>
          )}
          {look.beard && (
            <mesh geometry={GEO.beard} material={hairM} position={[0, -0.32, 0.22]} rotation={[0.35, 0, 0]} />
          )}
          {look.circlet && !look.hood && (
            <mesh
              geometry={GEO.circlet}
              material={mat('#d8b56a', 0.25)}
              position={[0, 0.22, 0]}
              rotation={[Math.PI / 2.2, 0, 0]}
            />
          )}
        </group>
      </group>
    </group>
  )
}
