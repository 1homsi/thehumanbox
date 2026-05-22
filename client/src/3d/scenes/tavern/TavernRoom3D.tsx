import type { SceneContext } from '../../../scenes/core/types'
import { SimpleRoom3D } from '../shared/SimpleRoom3D'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

function Fireplace() {
  return (
    <group position={[-3, 0, -1.5]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 0.5]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <coneGeometry args={[0.22, 0.45, 8]} />
        <meshStandardMaterial color="#ff8030" emissive="#ff5020" emissiveIntensity={0.8} />
      </mesh>
      <pointLight position={[0, 0.7, 0]} intensity={1.2} distance={5} color="#ffa050" castShadow />
    </group>
  )
}

function Bar() {
  return (
    <mesh position={[2.5, 0.5, -2]} castShadow>
      <boxGeometry args={[2.5, 1, 0.6]} />
      <meshStandardMaterial color="#7a4e26" roughness={0.7} />
    </mesh>
  )
}

function Barrels() {
  return (
    <group position={[3, 0, 1]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.8, 12]} />
        <meshStandardMaterial color="#5a3a20" />
      </mesh>
      <mesh position={[0.7, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.8, 12]} />
        <meshStandardMaterial color="#5a3a20" />
      </mesh>
    </group>
  )
}

function LongTable() {
  return (
    <group position={[-0.3, 0, 0.5]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[3.2, 0.1, 1.0]} />
        <meshStandardMaterial color="#9c7448" roughness={0.6} />
      </mesh>
      <mesh position={[-1.4, 0.2, -0.4]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#3a2410" />
      </mesh>
      <mesh position={[1.4, 0.2, -0.4]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#3a2410" />
      </mesh>
      <mesh position={[-1.4, 0.2, 0.4]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#3a2410" />
      </mesh>
      <mesh position={[1.4, 0.2, 0.4]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#3a2410" />
      </mesh>
    </group>
  )
}

export function TavernRoom3D({ ctx, onExit, onFocusOrg }: Props) {
  return (
    <SimpleRoom3D
      ctx={ctx}
      onExit={onExit}
      onFocusOrg={onFocusOrg}
      walls={{ color: '#8a5a30', floor: '#5a3e22' }}
      furniture={
        <>
          <Fireplace />
          <Bar />
          <Barrels />
          <LongTable />
        </>
      }
      metaSuffix="tavern"
    />
  )
}
