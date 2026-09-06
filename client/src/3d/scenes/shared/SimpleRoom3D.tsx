import { Suspense, useMemo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { SceneContext } from '../../../scenes/core/types'
import { useUIStore } from '../../../stores/store'
import { VillagerFigure } from '../../world/parts/VillagerFigure'
import type { OrganismState } from '../../../types'
import { lineageColor } from '../../../utils/constants'

interface Props {
  ctx: SceneContext
  onExit: () => void
  onFocusOrg: (id: string) => void
  walls: { color: string; floor: string }
  furniture: ReactNode
  metaSuffix?: string
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

function Walls({ color, floor }: { color: string; floor: string }) {
  const W = 8
  const D = 6
  const H = 3
  const T = 0.2
  return (
    <group>
      <mesh position={[0, H / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[-W / 2, H / 2, 0]} receiveShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} receiveShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - T, D - T]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={`seam-${i}`} position={[-3.64 + i * 0.56, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, D - T]} />
          <meshStandardMaterial color="#4b3527" roughness={1} />
        </mesh>
      ))}
      {[-3.8, 0, 3.8].map((x) => (
        <mesh key={`post-${x}`} position={[x, H / 2, -2.86]} castShadow>
          <boxGeometry args={[0.16, H, 0.14]} />
          <meshStandardMaterial color="#654a36" roughness={0.95} />
        </mesh>
      ))}
      {[0.15, 2.85].map((y) => (
        <mesh key={`beam-${y}`} position={[0, y, -2.84]} castShadow>
          <boxGeometry args={[W - T, 0.16, 0.16]} />
          <meshStandardMaterial color="#654a36" roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

function Occupant({
  x,
  z,
  color,
  org,
  selected,
  onClick,
}: {
  x: number
  z: number
  color: string
  org: OrganismState
  selected: boolean
  onClick: () => void
}) {
  return (
    <group position={[x, 0, z]} onClick={onClick}>
      <VillagerFigure
        org={org}
        tunicColor={color}
        getPosition={() => [0, 0, 0]}
        scale={0.55}
        animation="Idle"
      />
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
    </group>
  )
}

export function SimpleRoom3D({ ctx, onExit, onFocusOrg, walls, furniture, metaSuffix }: Props) {
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
          {occupants.length === 0 ? 'empty' : `${occupants.length} inside`}
          {metaSuffix ? ` · ${metaSuffix}` : ''}
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
          <Walls color={walls.color} floor={walls.floor} />
          <Suspense fallback={null}>{furniture}</Suspense>
          {occupants.map((occ, i) => {
            const [x, z] = slots[i] ?? [0, 0]
            return (
              <Occupant
                key={occ.org.id}
                org={occ.org}
                x={x}
                z={z}
                color={lineageColor(occ.org.lineage_id)}
                selected={occ.org.id === selectedOrgId}
                onClick={() => onFocusOrg(occ.org.id)}
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
            >
              <span className="scene-occupant-role">{o.role} · nearby</span>
              <span className="scene-occupant-name">{o.org.name}</span>
              <span className="scene-occupant-act">{o.activity}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
