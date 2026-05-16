import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, KeyboardControls, useKeyboardControls, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'

// Phase 1 skeleton: free-fly WASD camera over an empty placeholder
// ground. No terrain, orgs, water, or trees yet - those come in Phase 2+.
// The goal here is just to validate the toggle works, the lazy chunk
// loads, controls feel right, and the 2D path stays untouched.

type MoveKeys = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'boost'

const KEY_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'back',    keys: ['KeyS', 'ArrowDown'] },
  { name: 'left',    keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right',   keys: ['KeyD', 'ArrowRight'] },
  { name: 'up',      keys: ['Space'] },
  { name: 'down',    keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'boost',   keys: ['ControlLeft', 'ControlRight'] },
]

// Free-fly controller. WASD plane, space/shift vertical, ctrl boost.
// Speed is intentionally moderate so the 2400x1200 world feels like
// an actual journey to traverse, not a quick teleport.
function FlyCamera() {
  const [, get] = useKeyboardControls<MoveKeys>()
  const { camera } = useThree()
  const velocity = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const k = get()
    const baseSpeed = 30
    const boostMult = k.boost ? 4 : 1
    const speed = baseSpeed * boostMult

    // Camera-local axes for movement (forward = where you're looking,
    // ignoring pitch on the horizontal plane so WS doesn't drag you
    // into the ground).
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3()
      .crossVectors(forward, camera.up)
      .normalize()

    velocity.current.set(0, 0, 0)
    if (k.forward) velocity.current.add(forward)
    if (k.back)    velocity.current.sub(forward)
    if (k.right)   velocity.current.add(right)
    if (k.left)    velocity.current.sub(right)
    if (k.up)      velocity.current.y += 1
    if (k.down)    velocity.current.y -= 1

    if (velocity.current.lengthSq() > 0) {
      velocity.current.normalize().multiplyScalar(speed * delta)
      camera.position.add(velocity.current)
    }
  })

  return null
}

// Placeholder so the user can see motion happening - a checkerboard
// 200x200 ground at y=0 and a colored cube as a reference object.
// Replaced in Phase 2 by real terrain from depth_map + biomes.
function PlaceholderWorld() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400, 1, 1]} />
        <meshStandardMaterial color="#4a8a4a" />
      </mesh>
      <gridHelper args={[400, 40, '#2a4a2a', '#356535']} position={[0, 0.01, 0]} />
      <mesh position={[0, 5, 0]} castShadow>
        <boxGeometry args={[4, 10, 4]} />
        <meshStandardMaterial color="#d49a55" />
      </mesh>
    </>
  )
}

interface Props {
  hideUI: boolean
}

export default function WorldView3D({ hideUI: _hideUI }: Props) {
  // Lock the pointer when the canvas is clicked so mouse-look works.
  // PointerLockControls handles esc-to-release.
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Block page scroll while the 3D view owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      ref={canvasContainerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        background: '#0c1018',
      }}
    >
      <KeyboardControls map={KEY_MAP}>
        <Canvas
          camera={{ position: [0, 30, 60], fov: 70, near: 0.1, far: 2000 }}
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <Sky sunPosition={[100, 60, 100]} turbidity={4} rayleigh={2} />
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[100, 200, 50]}
              intensity={1.2}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <PlaceholderWorld />
            <FlyCamera />
            <PointerLockControls />
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {/* HUD hint, hidden once user interacts. Updated when the real
          world lands in Phase 2. */}
      <div style={hudStyle}>
        click to look · WASD move · space up · shift down · ctrl boost · esc release
      </div>
    </div>
  )
}

const hudStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  color: '#cad3df',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: '0.04em',
  background: 'rgba(12, 16, 24, 0.55)',
  padding: '6px 10px',
  borderRadius: 4,
  pointerEvents: 'none',
}
