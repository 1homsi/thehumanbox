import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { KeyboardControls, useKeyboardControls, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { WorldState } from './types'
import { Terrain } from './three/Terrain'
import { Water } from './three/Water'
import { Sun } from './three/Sun'
import { Organisms } from './three/Organisms'
import { Humans3D } from './three/Humans3D'
import { Animals3D } from './three/Animals3D'
import { OrgLabels } from './three/OrgLabels'
import { TileFeatures } from './three/TileFeatures'
import { Weather } from './three/Weather'
import { MiniMap } from './three/MiniMap'
import { CameraSync } from './three/CameraSync'
import { TILE_SCALE } from './three/constants'
import { heightAtWorld } from './three/terrain-utils'
import { updateOrgMotion, updateAnimalMotion } from './three/motion-state'

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

interface FlyCameraProps {
  depthMap?: number[][]
  biomes?:   number[][]
}

const FLOOR_CLEARANCE = 0.8     // eye height above terrain/water
const MIN_SEA_LEVEL   = 0.6     // never drop below water surface
const MAX_ALTITUDE    = 900     // fly high enough to see the whole map from above

function FlyCamera({ depthMap, biomes }: FlyCameraProps) {
  const [, get] = useKeyboardControls<MoveKeys>()
  const { camera } = useThree()
  const velocity = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const k = get()
    const speed = 30 * (k.boost ? 4 : 1)

    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()

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

    // Vertical bounds only - horizontal stays free so the user can
    // fly off the edge if they want.
    if (depthMap && biomes) {
      const groundY = heightAtWorld(camera.position.x, camera.position.z, depthMap, biomes)
      const minY = Math.max(groundY, 0) + FLOOR_CLEARANCE
      if (camera.position.y < minY) camera.position.y = minY
      if (camera.position.y < MIN_SEA_LEVEL) camera.position.y = MIN_SEA_LEVEL
    }
    if (camera.position.y > MAX_ALTITUDE) camera.position.y = MAX_ALTITUDE
  })
  return null
}

interface Props {
  world: WorldState | null
  hideUI: boolean
}

export default function WorldView3D({ world, hideUI: _hideUI }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Wait for terrain layers (cold metadata from HTTP /snapshot) before
  // building the heightfield. Until then, show a loading state inside
  // the canvas so users see "the world is coming" not "everything is
  // broken".
  const grid = world?.grid
  const ready = !!(grid?.depth_map && grid?.biomes && grid?.tiles && grid?.width && grid?.height)
  const dayProgress = world?.day_progress ?? 0.3

  // Feed the motion state map on every WS tick so every 3D component
  // can read interpolated positions per frame for smooth motion.
  const orgsForMotion    = world?.viewport_organisms ?? world?.organisms ?? []
  const animalsForMotion = world?.viewport_animals   ?? world?.animals   ?? []
  useEffect(() => {
    updateOrgMotion(orgsForMotion)
    updateAnimalMotion(animalsForMotion)
  }, [orgsForMotion, animalsForMotion])

  // Spawn the camera high enough to see the whole world on first load.
  const cx = (grid?.width ?? 150) * TILE_SCALE * 0.5
  const cz = (grid?.height ?? 75) * TILE_SCALE * 0.5

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        background: '#0c1018',
      }}
    >
      <KeyboardControls map={KEY_MAP}>
        <Canvas
          camera={{ position: [cx, 120, cz + 200], fov: 70, near: 0.5, far: 4000 }}
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            {ready && grid && (
              <>
                <Sun
                  dayProgress={dayProgress}
                  width={grid.width}
                  height={grid.height}
                  weatherKind={world.weather?.kind ?? 'clear'}
                  weatherIntensity={world.weather?.intensity ?? 0}
                />
                <Terrain
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                  width={grid.width}
                  height={grid.height}
                />
                <Water width={grid.width} height={grid.height} />
                <TileFeatures
                  tiles={grid.tiles!}
                  biomes={grid.biomes!}
                  depthMap={grid.depth_map!}
                  width={grid.width}
                  height={grid.height}
                />
                <Organisms
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <Humans3D
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <Animals3D
                  animals={world.viewport_animals ?? world.animals ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <OrgLabels
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <Weather
                  kind={world.weather?.kind ?? 'clear'}
                  intensity={world.weather?.intensity ?? 0}
                />
              </>
            )}
            <FlyCamera depthMap={grid?.depth_map} biomes={grid?.biomes} />
            <CameraSync />
            <PointerLockControls />
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {ready && grid && (
        <MiniMap
          organisms={world.viewport_organisms ?? world.organisms ?? []}
          depthMap={grid.depth_map!}
          biomes={grid.biomes!}
          width={grid.width}
          height={grid.height}
        />
      )}

      {!ready && (
        <div style={loadingStyle}>loading terrain…</div>
      )}

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

const loadingStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: '#cad3df',
  fontFamily: 'monospace',
  fontSize: 14,
  pointerEvents: 'none',
}
