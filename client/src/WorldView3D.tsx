import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { KeyboardControls, useKeyboardControls, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { WorldState } from './types'
import { useUIStore } from './store'
import { Terrain } from './three/Terrain'
import { Water } from './three/Water'
import { Sun } from './three/Sun'
import { Humans3D } from './three/Humans3D'
import { Animals3D } from './three/Animals3D'
import { OrgLabels } from './three/OrgLabels'
import { TileFeatures } from './three/TileFeatures'
import { Weather } from './three/Weather'
import { Birds } from './three/Birds'
import { Clouds3D } from './three/Clouds3D'
import { MiniMap } from './three/MiniMap'
import { CameraSync } from './three/CameraSync'
import { SelectedOrgHighlight } from './three/SelectedOrgHighlight'
import { SelectedOrgCard } from './three/SelectedOrgCard'
import { WorldHud } from './three/WorldHud'
import { EventFloaters } from './three/EventFloaters'
import { OrgStateBadges } from './three/OrgStateBadges'
import { FootstepDust } from './three/FootstepDust'
import { TILE_SCALE } from './three/constants'
import { heightAtWorld, heightAt } from './three/terrain-utils'
import { updateOrgMotion, updateAnimalMotion, getOrgXY } from './three/motion-state'
import { cameraCommand } from './three/camera-state'

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
    // ── External commands (minimap click teleport) ─────────────────
    if (cameraCommand.teleport) {
      const { x, y, z } = cameraCommand.teleport
      camera.position.set(x, y, z)
      cameraCommand.teleport = null
    }

    // ── Follow selected org ────────────────────────────────────────
    // Soft chase: lerp the camera horizontal position toward the
    // org's location at a small distance behind, without touching
    // yaw/pitch (the user still mouselooks). Disabled when the user
    // is actively driving with WASD so manual flight isn't fought.
    const k = get()
    const userDriving = k.forward || k.back || k.left || k.right || k.up || k.down
    if (cameraCommand.followOrgId && !userDriving) {
      const [tx, ty] = getOrgXY(cameraCommand.followOrgId)
      if (tx !== 0 || ty !== 0) {
        const wx = tx * TILE_SCALE
        const wz = ty * TILE_SCALE
        // Target: 35 units behind the org along the camera's current
        // horizontal facing, at ~12 units altitude.
        const fwd = new THREE.Vector3()
        camera.getWorldDirection(fwd)
        fwd.y = 0
        if (fwd.lengthSq() > 0) fwd.normalize()
        const targetX = wx - fwd.x * 35
        const targetZ = wz - fwd.z * 35
        const groundY = (depthMap && biomes)
          ? heightAt(tx, ty, depthMap, biomes)
          : 0
        const targetY = groundY + 12
        // Lerp factor scaled by frame time for FPS-independent smoothing.
        const lerp = 1 - Math.exp(-3.0 * delta)
        camera.position.x += (targetX - camera.position.x) * lerp
        camera.position.y += (targetY - camera.position.y) * lerp
        camera.position.z += (targetZ - camera.position.z) * lerp
      }
    }

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
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const [follow, setFollow] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const selectOrg = useUIStore(s => s.selectOrg)

  // F key toggles "follow selected org" mode. Clears automatically
  // if no org is selected. ESC clears the follow state (PointerLock
  // already consumes ESC to release the mouse, but a brief tap exits
  // follow first if active).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        if (selectedOrgId) setFollow(prev => !prev)
      } else if (e.code === 'Escape' && follow) {
        setFollow(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedOrgId, follow, selectOrg])

  useEffect(() => {
    cameraCommand.followOrgId = (follow && selectedOrgId) ? selectedOrgId : null
  }, [follow, selectedOrgId])

  // Wait for terrain layers (cold metadata from HTTP /snapshot) before
  // building the heightfield. Until then, show a loading state inside
  // the canvas so users see "the world is coming" not "everything is
  // broken".
  const grid = world?.grid
  const ready = !!(grid?.depth_map && grid?.biomes && grid?.tiles && grid?.width && grid?.height)
  const dayProgress = world?.day_progress ?? 0.3
  // Match Sun.tsx's altitude formula so Birds know night status.
  const sunAlt   = Math.sin((dayProgress - 0.25) * 2 * Math.PI)
  const isNight  = sunAlt < 0

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
                <Water
                  width={grid.width}
                  height={grid.height}
                  depthMap={grid.depth_map!}
                />
                <TileFeatures
                  tiles={grid.tiles!}
                  biomes={grid.biomes!}
                  depthMap={grid.depth_map!}
                  width={grid.width}
                  height={grid.height}
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
                <SelectedOrgHighlight
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <EventFloaters
                  events={world.events ?? []}
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <OrgStateBadges
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <FootstepDust
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <Weather
                  kind={world.weather?.kind ?? 'clear'}
                  intensity={world.weather?.intensity ?? 0}
                />
                <Birds
                  width={grid.width}
                  height={grid.height}
                  isNight={isNight}
                  weatherKind={world.weather?.kind ?? 'clear'}
                />
                <Clouds3D
                  width={grid.width}
                  height={grid.height}
                  isNight={isNight}
                  weatherKind={world.weather?.kind ?? 'clear'}
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
        <SelectedOrgCard
          organisms={world.viewport_organisms ?? world.organisms ?? []}
        />
      )}

      {ready && (
        <WorldHud
          dayProgress={dayProgress}
          tickCount={world?.tick}
          weatherKind={world?.weather?.kind ?? 'clear'}
        />
      )}

      {ready && grid && (
        <MiniMap
          organisms={world.viewport_organisms ?? world.organisms ?? []}
          animals={world.viewport_animals ?? world.animals ?? []}
          tiles={grid.tiles!}
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
        click to look · WASD move · space up · shift down · ctrl boost · F follow · click map to jump · esc release
        {follow && selectedOrgId && (
          <span style={{ color: '#ff8a3a', marginLeft: 10 }}>· following</span>
        )}
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
