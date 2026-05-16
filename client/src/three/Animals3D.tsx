import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AnimalState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'
import { getAnimalXY } from './motion-state'

interface Props {
  animals:  AnimalState[]
  depthMap: number[][]
  biomes:   number[][]
}

// Animals split two ways:
//
//   1. Foxes (the "dog" kind only) get the real Fox.glb model.
//      Scale 0.012 so the fox is roughly knee-high on a robot.
//
//   2. Every other kind (rabbit, deer, boar, bird, wolf, fish)
//      gets a procedural primitive shape until we have proper
//      models. Each kind has its own silhouette so they read
//      distinct from a distance.

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

// ── Procedural meshes per kind ──────────────────────────────────────────
// Each function returns a Group containing the kind's silhouette,
// ready to drop into the scene. They're not animated for now -
// animation would need rigged GLBs.

function RabbitMesh({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <sphereGeometry args={[0.25, 6, 5]} />
        <meshStandardMaterial color={tint} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0.05]} castShadow>
        <sphereGeometry args={[0.16, 5, 5]} />
        <meshStandardMaterial color={tint} roughness={0.8} />
      </mesh>
      {/* ears */}
      <mesh position={[-0.06, 0.78, 0.04]} rotation={[0.1, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.28, 4]} />
        <meshStandardMaterial color={tint} roughness={0.8} />
      </mesh>
      <mesh position={[ 0.06, 0.78, 0.04]} rotation={[0.1, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.28, 4]} />
        <meshStandardMaterial color={tint} roughness={0.8} />
      </mesh>
    </group>
  )
}

function DeerMesh({ tint }: { tint: string }) {
  return (
    <group>
      {/* body */}
      <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.6, 4, 6]} />
        <meshStandardMaterial color={tint} roughness={0.85} />
      </mesh>
      {/* legs */}
      {[[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.4, z]} castShadow>
          <cylinderGeometry args={[0.06, 0.05, 0.8, 4]} />
          <meshStandardMaterial color="#3a2a1a" roughness={0.85} />
        </mesh>
      ))}
      {/* head */}
      <mesh position={[0, 1.2, 0.4]} castShadow>
        <sphereGeometry args={[0.22, 6, 5]} />
        <meshStandardMaterial color={tint} roughness={0.85} />
      </mesh>
      {/* antlers */}
      <mesh position={[-0.1, 1.5, 0.4]} rotation={[0.4, 0, -0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.04, 0.35, 3]} />
        <meshStandardMaterial color="#6b4a2a" />
      </mesh>
      <mesh position={[ 0.1, 1.5, 0.4]} rotation={[0.4, 0, 0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.04, 0.35, 3]} />
        <meshStandardMaterial color="#6b4a2a" />
      </mesh>
    </group>
  )
}

function BoarMesh({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.55, 4, 6]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      {[[-0.16, 0.28], [0.16, 0.28], [-0.16, -0.28], [0.16, -0.28]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.18, z]} castShadow>
          <cylinderGeometry args={[0.06, 0.05, 0.35, 4]} />
          <meshStandardMaterial color="#2a1a10" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0.5]} castShadow>
        <coneGeometry args={[0.18, 0.4, 5]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
    </group>
  )
}

function BirdMesh({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[0.16, 6, 5]} />
        <meshStandardMaterial color={tint} roughness={0.7} />
      </mesh>
      {/* wings */}
      <mesh position={[-0.18, 1.32, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.3, 0.04, 0.18]} />
        <meshStandardMaterial color={tint} roughness={0.7} />
      </mesh>
      <mesh position={[ 0.18, 1.32, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.3, 0.04, 0.18]} />
        <meshStandardMaterial color={tint} roughness={0.7} />
      </mesh>
      {/* beak */}
      <mesh position={[0, 1.32, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.04, 0.1, 4]} />
        <meshStandardMaterial color="#d8a040" />
      </mesh>
    </group>
  )
}

function WolfMesh({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 4, 6]} />
        <meshStandardMaterial color={tint} roughness={0.85} />
      </mesh>
      {[[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.32], [0.14, -0.32]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.04, 0.5, 4]} />
          <meshStandardMaterial color={tint} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.75, 0.42]} castShadow>
        <sphereGeometry args={[0.17, 6, 5]} />
        <meshStandardMaterial color={tint} roughness={0.85} />
      </mesh>
      {/* ears */}
      <mesh position={[-0.08, 0.92, 0.42]} rotation={[0, 0, -0.3]} castShadow>
        <coneGeometry args={[0.05, 0.12, 3]} />
        <meshStandardMaterial color={tint} />
      </mesh>
      <mesh position={[ 0.08, 0.92, 0.42]} rotation={[0, 0, 0.3]} castShadow>
        <coneGeometry args={[0.05, 0.12, 3]} />
        <meshStandardMaterial color={tint} />
      </mesh>
    </group>
  )
}

function FishMesh({ tint }: { tint: string }) {
  return (
    <group>
      {/* fish only renders if it happens to be near surface */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.18, 0.55, 5]} />
        <meshStandardMaterial color={tint} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.12, 0.2, 4]} />
        <meshStandardMaterial color={tint} roughness={0.5} />
      </mesh>
    </group>
  )
}

function ProceduralAnimal({ id, kind, tint, yaw, depthMap, biomes }: {
  id: number; kind: AnimalState['kind']; tint: string; yaw: number;
  depthMap: number[][]; biomes: number[][];
}) {
  const ref = useRef<THREE.Group>(null)
  const lastPos = useRef<[number, number]>([0, 0])
  useEffect(() => {
    if (!ref.current) return
    ref.current.traverse(o => { o.frustumCulled = false })
  })
  useFrame(() => {
    if (!ref.current) return
    const [tx, ty] = getAnimalXY(id)
    const groundY = heightAt(tx, ty, depthMap, biomes)
    ref.current.position.set(tx * TILE_SCALE, groundY, ty * TILE_SCALE)
    // Face direction of motion.
    const [lx, lz] = lastPos.current
    const dx = tx - lx, dz = ty - lz
    if (dx * dx + dz * dz > 0.0005) {
      ref.current.rotation.y = Math.atan2(dx, dz)
    }
    lastPos.current = [tx, ty]
  })
  let body
  switch (kind) {
    case 'rabbit': body = <RabbitMesh tint={tint} />; break
    case 'deer':   body = <DeerMesh   tint={tint} />; break
    case 'boar':   body = <BoarMesh   tint={tint} />; break
    case 'bird':   body = <BirdMesh   tint={tint} />; break
    case 'wolf':   body = <WolfMesh   tint={tint} />; break
    case 'fish':   body = <FishMesh   tint={tint} />; break
    default:       body = <RabbitMesh tint={tint} />
  }
  return (
    <group ref={ref} rotation={[0, yaw, 0]} frustumCulled={false}>
      {body}
    </group>
  )
}

export function Animals3D({ animals, depthMap, biomes }: Props) {
  const { scene, animations } = useGLTF('/models/fox.glb')
  if (!depthMap || !biomes) return null

  return (
    <>
      {animals.map(a => {
        const tint = KIND_TINT[a.kind] ?? '#aa8855'
        const yaw = seededYaw(a.id)
        if (a.kind === 'dog') {
          return (
            <AnimatedFigure
              key={a.id}
              scene={scene}
              animations={animations}
              getPosition={() => {
                const [tx, ty] = getAnimalXY(a.id)
                const groundY = heightAt(tx, ty, depthMap, biomes)
                return [tx * TILE_SCALE, groundY, ty * TILE_SCALE]
              }}
              rotationY={yaw}
              scale={0.012}
              animation="Walk"
              color={tint}
            />
          )
        }
        return (
          <ProceduralAnimal
            key={a.id}
            id={a.id}
            kind={a.kind}
            tint={tint}
            yaw={yaw}
            depthMap={depthMap}
            biomes={biomes}
          />
        )
      })}
    </>
  )
}

useGLTF.preload('/models/fox.glb')
