import type { SceneContext } from '../../../scenes/core/types'
import { SimpleRoom3D } from '../shared/SimpleRoom3D'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

function Altar() {
  return (
    <group position={[0, 0, -2]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[2, 1, 0.8]} />
        <meshStandardMaterial color="#c4b894" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.4, 0.05, 0.6]} />
        <meshStandardMaterial color="#e8dcb0" />
      </mesh>
    </group>
  )
}

function Candle({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.6, 8]} />
        <meshStandardMaterial color="#e8dcb0" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#ff8030" emissive="#ffaa30" emissiveIntensity={1.5} />
      </mesh>
      <pointLight position={[0, 0.75, 0]} intensity={0.6} distance={2} color="#ffd680" />
    </group>
  )
}

function Idol() {
  return (
    <mesh position={[0, 1.3, -2]} castShadow>
      <boxGeometry args={[0.3, 1, 0.3]} />
      <meshStandardMaterial color="#bcae8e" />
    </mesh>
  )
}

function Pew({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.25, z]} castShadow>
      <boxGeometry args={[1.2, 0.1, 0.3]} />
      <meshStandardMaterial color="#7a5230" />
    </mesh>
  )
}

export function TempleRoom3D({ ctx, onExit, onFocusOrg }: Props) {
  return (
    <SimpleRoom3D
      ctx={ctx}
      onExit={onExit}
      onFocusOrg={onFocusOrg}
      walls={{ color: '#a89072', floor: '#7a6450' }}
      furniture={
        <>
          <Altar />
          <Idol />
          <Candle x={-1.5} z={-1.5} />
          <Candle x={1.5} z={-1.5} />
          <Pew x={-1.5} z={1} />
          <Pew x={1.5} z={1} />
        </>
      }
      metaSuffix="temple"
    />
  )
}
