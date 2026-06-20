import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { lineageColor } from '../../../utils/constants'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
}

const ROOM_W = 8
const ROOM_D = 6
const ROOM_H = 3
const WALL_T = 0.2

function Walls() {
  return (
    <group>
      <mesh position={[0, ROOM_H / 2, -ROOM_D / 2]} receiveShadow>
        <boxGeometry args={[ROOM_W, ROOM_H, WALL_T]} />
        <meshStandardMaterial color="#8e6a3a" roughness={0.9} />
      </mesh>
      <mesh position={[-ROOM_W / 2, ROOM_H / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_T, ROOM_H, ROOM_D]} />
        <meshStandardMaterial color="#7e5a2c" roughness={0.9} />
      </mesh>
      <mesh position={[ROOM_W / 2, ROOM_H / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_T, ROOM_H, ROOM_D]} />
        <meshStandardMaterial color="#7e5a2c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W - WALL_T, ROOM_D - WALL_T]} />
        <meshStandardMaterial color="#5a3e22" roughness={1} />
      </mesh>
    </group>
  )
}

function Hearth({ time }: { time: number }) {
  const flicker = 0.6 + Math.sin(time * 0.008) * 0.2
  return (
    <group position={[-ROOM_W / 2 + 1.0, 0, ROOM_D / 2 - 1.0]}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.3, 12]} />
        <meshStandardMaterial color="#2a1a10" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <coneGeometry args={[0.32, 0.6, 8]} />
        <meshStandardMaterial color="#ff8030" emissive="#ff5020" emissiveIntensity={flicker} />
      </mesh>
      <pointLight position={[0, 0.6, 0]} intensity={1.5 * flicker} distance={6} color="#ffa050" castShadow />
    </group>
  )
}

function SleepMat() {
  return (
    <mesh position={[ROOM_W / 2 - 1.4, 0.06, -ROOM_D / 2 + 1.2]} receiveShadow>
      <boxGeometry args={[1.6, 0.12, 0.8]} />
      <meshStandardMaterial color="#7c5a3a" roughness={1} />
    </mesh>
  )
}

function Furniture() {
  return (
    <group>
      {/* Rug */}
      <mesh position={[0.2, 0.02, -0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.6, 2.0]} />
        <meshStandardMaterial color="#9a4838" roughness={1} />
      </mesh>
      {/* Table */}
      <group position={[0.2, 0, -0.3]}>
        <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.1, 0.9]} />
          <meshStandardMaterial color="#6e4a26" roughness={0.85} />
        </mesh>
        {[
          [-0.65, -0.38],
          [0.65, -0.38],
          [-0.65, 0.38],
          [0.65, 0.38],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.31, lz]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.62, 6]} />
            <meshStandardMaterial color="#583a1e" />
          </mesh>
        ))}
        {/* a bowl + a loaf on the table */}
        <mesh position={[-0.3, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.12, 0.1, 10]} />
          <meshStandardMaterial color="#caa46a" />
        </mesh>
        <mesh position={[0.35, 0.72, 0.1]} castShadow>
          <boxGeometry args={[0.32, 0.16, 0.2]} />
          <meshStandardMaterial color="#c08a4a" roughness={1} />
        </mesh>
      </group>
      {/* Two stools */}
      {[
        [-0.9, -0.3],
        [1.3, -0.3],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx, 0.28, sz]} castShadow>
          <cylinderGeometry args={[0.26, 0.24, 0.12, 10]} />
          <meshStandardMaterial color="#6e4a26" roughness={0.9} />
        </mesh>
      ))}
      {/* Wall shelf with pots on the back wall */}
      <group position={[1.6, 1.7, -ROOM_D / 2 + WALL_T + 0.15]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.2, 0.08, 0.4]} />
          <meshStandardMaterial color="#5e3e1c" roughness={0.95} />
        </mesh>
        {[-0.7, 0, 0.7].map((px, i) => (
          <mesh key={i} position={[px, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.18, 0.34, 9]} />
            <meshStandardMaterial color={i === 1 ? '#7a8a4a' : '#8a5a3a'} roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* Hanging herb bundles from a ceiling beam near the hearth */}
      <group position={[-ROOM_W / 2 + 1.6, ROOM_H - 0.35, ROOM_D / 2 - 1.6]}>
        {[-0.4, 0, 0.4].map((hx, i) => (
          <mesh key={i} position={[hx, -0.25, 0]} castShadow>
            <coneGeometry args={[0.12, 0.5, 5]} />
            <meshStandardMaterial color={i % 2 ? '#6a7a38' : '#8a8a48'} roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function StorageChest() {
  return (
    <mesh position={[ROOM_W / 2 - 1.0, 0.3, ROOM_D / 2 - 1.0]} castShadow receiveShadow>
      <boxGeometry args={[1.0, 0.6, 0.7]} />
      <meshStandardMaterial color="#5e3e1c" roughness={0.95} />
    </mesh>
  )
}

function Occupant({
  x,
  z,
  color,
  selected,
  onClick,
  name,
}: {
  x: number
  z: number
  color: string
  selected: boolean
  onClick: () => void
  name: string
}) {
  return (
    <group position={[x, 0, z]} onClick={onClick}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.18, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#e6c8a8" roughness={0.6} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.4, 24]} />
          <meshBasicMaterial color="#ffe066" transparent opacity={0.85} />
        </mesh>
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 12]} />
        <meshBasicMaterial color="black" transparent opacity={0.35} />
      </mesh>
      <Suspense fallback={null}>
        <Text3D name={name} y={1.5} />
      </Suspense>
    </group>
  )
}

function Text3D({ name, y }: { name: string; y: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <planeGeometry args={[Math.max(name.length * 0.16, 1), 0.32]} />
      <meshBasicMaterial color="#1a120c" transparent opacity={0} />
    </mesh>
  )
}

function slotsFor(n: number): Array<[number, number]> {
  const slots: Array<[number, number]> = []
  if (n === 0) return slots
  const rows = Math.ceil(Math.sqrt(n))
  let i = 0
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      if (i >= n) break outer
      const x = -1.2 + c * 1.2 - (rows - 1) * 0.3
      const z = -0.6 + r * 1.0 - (rows - 1) * 0.3
      slots.push([x, z])
      i++
    }
  }
  return slots
}

function FrameTick({ children }: { children: (t: number) => React.ReactNode }) {
  return <>{children(performance.now())}</>
}

export function HomeRoom3D({ ctx, onExit, onFocusOrg }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const { title, subtitle, occupants, away, isDay } = ctx
  const slots = useMemo(() => slotsFor(occupants.length), [occupants.length])

  return (
    <div className="scene-shell">
      <div className="scene-head">
        <button className="scene-back" onClick={onExit} aria-label="Back to map">
          ← back to map
        </button>
        <div className="scene-title-wrap">
          <div className="scene-title">{title}</div>
          <div className="scene-subtitle">{subtitle}</div>
        </div>
        <div className="scene-meta">
          {occupants.length === 0
            ? 'no one home'
            : occupants.length === 1
              ? 'alone'
              : `${occupants.length} inside`}
          {' · 3D · '}
          {isDay ? '☀ day' : '☾ night'}
        </div>
      </div>

      <div className="scene-stage" style={{ background: '#0c0805' }}>
        <Canvas
          shadows
          camera={{ position: [0, 4.5, 5.5], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={isDay ? 0.55 : 0.25} color={isDay ? '#fff5e0' : '#7a8aa0'} />
          <directionalLight
            position={[3, 6, 4]}
            intensity={isDay ? 0.9 : 0.25}
            color={isDay ? '#ffe6b8' : '#90a0b8'}
            castShadow
          />
          <Walls />
          <FrameTick>{(t) => <Hearth time={t} />}</FrameTick>
          <SleepMat />
          <StorageChest />
          <Furniture />
          {occupants.map((occ, i) => {
            const [x, z] = slots[i] ?? [0, 0]
            return (
              <Occupant
                key={occ.org.id}
                x={x}
                z={z}
                color={lineageColor(occ.org.lineage_id)}
                selected={occ.org.id === selectedOrgId}
                onClick={() => onFocusOrg(occ.org.id)}
                name={occ.org.name}
              />
            )
          })}
          <OrbitControls
            enableDamping
            target={[0, 1, 0]}
            maxPolarAngle={Math.PI * 0.48}
            minDistance={4}
            maxDistance={12}
          />
        </Canvas>
      </div>

      {(occupants.length > 0 || away.length > 0) && (
        <div className="scene-occupants">
          {occupants.map((o) => (
            <button
              key={`in-${o.org.id}`}
              className={'scene-occupant-chip' + (o.org.id === selectedOrgId ? ' active' : '')}
              onClick={() => onFocusOrg(o.org.id)}
            >
              <span className="scene-occupant-role">{o.role}</span>
              <span className="scene-occupant-name">{o.org.name}</span>
              <span className="scene-occupant-act">{o.activity}</span>
            </button>
          ))}
          {away.map((o) => (
            <button
              key={`out-${o.org.id}`}
              className={
                'scene-occupant-chip scene-occupant-chip--away' +
                (o.org.id === selectedOrgId ? ' active' : '')
              }
              onClick={() => onFocusOrg(o.org.id)}
              title="Currently out"
            >
              <span className="scene-occupant-role">{o.role} · out</span>
              <span className="scene-occupant-name">{o.org.name}</span>
              <span className="scene-occupant-act">{o.activity}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
