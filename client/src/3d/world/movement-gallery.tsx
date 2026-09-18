import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrganismState } from '../../types'
import { VillagerFigure } from './parts/VillagerFigure'
import { getOrgHeading, getOrgVelocityXY, getOrgXY, updateOrgMotion } from './parts/motion-state'

const actors = ['walker', 'runner', 'builder'].map((id, i) => ({
  id,
  name: id,
  lineage_id: id,
  alive: true,
  x: i * 2 - 2,
  y: 0,
  age: 1000,
  age_stage: 'adult',
  generation: 1,
  max_age: 10000,
  energy: 1,
  hydration: 1,
  health: 1,
  infection: 0,
  fear_level: 0,
  carrying: i === 2 ? 1 : 0,
  carrying_type: 0,
  thought: '',
  traits: { aggression: 0.3, curiosity: 0.5, social_tendency: 0.5, memory_strength: 0.5, resilience: 0.5 },
})) as OrganismState[]

export function Review() {
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => setStep((s) => s + 1), 120)
    return () => clearInterval(timer)
  }, [paused])
  useEffect(() => {
    // Travel, stop, return, work: identical snapshots feed the production smoother.
    const phase = step % 100
    const distance = phase < 30 ? phase / 30 : phase < 45 ? 1 : phase < 75 ? 1 - (phase - 45) / 30 : 0
    updateOrgMotion(actors.map((o, i) => ({ ...o, y: distance * (i === 1 ? 2 : 1) })))
  }, [step])
  return (
    <>
      <header>
        <strong>3D movement review</strong>
        <span>Walk · run · carry / work — stop and turn cycle</span>
        <button onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
      </header>
      <div id="scene">
        <Canvas camera={{ position: [11, 10, 15], fov: 45 }} dpr={[1, 1.5]}>
          <color attach="background" args={['#9aafa6']} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 10, 8]} intensity={2} />
          <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 3]}>
            <planeGeometry args={[28, 20]} />
            <meshStandardMaterial color="#789657" roughness={1} />
          </mesh>
          <gridHelper args={[28, 28, '#8a9868', '#8a9868']} position={[0, 0, 3]} />
          {actors.map((org, i) => (
            <VillagerFigure
              key={org.id}
              org={org}
              tunicColor={['#d5a755', '#709bbc', '#a7654c'][i]}
              scale={1}
              animation="Idle"
              getAnimation={() => {
                const [vx, vy] = getOrgVelocityXY(org.id)
                return Math.hypot(vx, vy) > 0.002
                  ? i === 1
                    ? 'Running'
                    : 'Walking'
                  : i === 2
                    ? 'Chop'
                    : 'Idle'
              }}
              getPosition={() => {
                const [x, y] = getOrgXY(org.id)
                return [x * 4, 0, y * 4]
              }}
              getHeading={() => getOrgHeading(org.id)}
            />
          ))}
          <OrbitControls target={[0, 1, 3]} enableDamping />
        </Canvas>
      </div>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<Review />)
