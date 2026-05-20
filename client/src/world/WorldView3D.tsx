import { Suspense, useRef, useEffect, useState, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { KeyboardControls, useKeyboardControls, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { WorldState } from '../types'
import { useUIStore } from '../stores/store'
import { Terrain } from '../three/Terrain'
import { Water } from '../three/Water'
import { Sun } from '../three/Sun'
import { Humans3D } from '../three/Humans3D'
import { Animals3D } from '../three/Animals3D'
import { OrgLabels } from '../three/OrgLabels'
import { TileFeatures } from '../three/TileFeatures'
import { Weather } from '../three/Weather'
import { Birds } from '../three/Birds'
import { Clouds3D } from '../three/Clouds3D'
import { Snow } from '../three/Snow'
import { HelpOverlay } from '../three/HelpOverlay'
import { AmbientMotes } from '../three/AmbientMotes'
import { MiniMap } from '../three/MiniMap'
import { CameraSync } from '../three/CameraSync'
import { SelectedOrgHighlight } from '../three/SelectedOrgHighlight'
import { SelectedOrgCard } from '../three/SelectedOrgCard'
import { WorldHud } from '../three/WorldHud'
import { EventFloaters } from '../three/EventFloaters'
import { OrgStateBadges } from '../three/OrgStateBadges'
import { FootstepDust } from '../three/FootstepDust'
import { TribeLabels } from '../three/TribeLabels'
import { FireLights } from '../three/FireLights'
import { TimeOfDayTint } from '../three/TimeOfDayTint'
import { Fireflies } from '../three/Fireflies'
import { SocialBeams } from '../three/SocialBeams'
import { TerritoryOverlay } from '../three/TerritoryOverlay'
import { TILE_SCALE } from '../three/constants'
import { heightAtWorld, heightAt } from '../three/terrain-utils'
import { getOrgXY } from '../three/motion-state'
import { cameraCommand } from '../three/camera-state'

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

const FLOOR_CLEARANCE = 0.8
const MIN_SEA_LEVEL   = 0.6
const MAX_ALTITUDE    = 900

const CAM_LS_KEY = 'thb-3d-cam-v1'

function loadSavedCam(): { x: number; y: number; z: number; rx: number; ry: number } | null {
  try {
    const raw = localStorage.getItem(CAM_LS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Record<string, unknown>
    if (!v || typeof v !== 'object') return null
    const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
    if (!num(v.x) || !num(v.y) || !num(v.z) || !num(v.rx) || !num(v.ry)) return null
    return { x: v.x, y: v.y, z: v.z, rx: v.rx, ry: v.ry }
  } catch { return null }
}

function FlyCamera({ depthMap, biomes }: FlyCameraProps) {
  const [, get] = useKeyboardControls<MoveKeys>()
  const { camera } = useThree()
  const velocity = useRef(new THREE.Vector3())
  const saveTimerRef = useRef(0)
  // Reuse these across every useFrame call instead of `new`-ing three
  // Vector3s per frame at 60 Hz.
  const fwdScratch     = useRef(new THREE.Vector3())
  const forwardScratch = useRef(new THREE.Vector3())
  const rightScratch   = useRef(new THREE.Vector3())

  useEffect(() => {
    const saved = loadSavedCam()
    if (saved) {
      camera.position.set(saved.x, saved.y, saved.z)
      camera.rotation.order = 'YXZ'
      camera.rotation.set(saved.rx, saved.ry, 0, 'YXZ')
    }
    camera.up.set(0, 1, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    if (cameraCommand.teleport) {
      const { x, y, z } = cameraCommand.teleport
      camera.position.set(x, y, z)
      cameraCommand.teleport = null
    }

    const k = get()
    const userDriving = k.forward || k.back || k.left || k.right || k.up || k.down
    if (cameraCommand.followOrgId && !userDriving) {
      const [tx, ty] = getOrgXY(cameraCommand.followOrgId)
      if (tx !== 0 || ty !== 0) {
        const wx = tx * TILE_SCALE
        const wz = ty * TILE_SCALE
        const fwd = fwdScratch.current
        camera.getWorldDirection(fwd)
        fwd.y = 0
        if (fwd.lengthSq() > 0) fwd.normalize()
        const targetX = wx - fwd.x * 35
        const targetZ = wz - fwd.z * 35
        const groundY = (depthMap && biomes)
          ? heightAt(tx, ty, depthMap, biomes)
          : 0
        const targetY = groundY + 12
        const lerp = 1 - Math.exp(-5.0 * delta)
        camera.position.x += (targetX - camera.position.x) * lerp
        camera.position.y += (targetY - camera.position.y) * lerp
        camera.position.z += (targetZ - camera.position.z) * lerp
      }
    }

    const speed = 30 * (k.boost ? 4 : 1)

    const forward = forwardScratch.current
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = rightScratch.current.crossVectors(forward, camera.up).normalize()

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

    if (depthMap && biomes) {
      const groundY = heightAtWorld(camera.position.x, camera.position.z, depthMap, biomes)
      const minY = Math.max(groundY, 0) + FLOOR_CLEARANCE
      if (camera.position.y < minY) camera.position.y = minY
      if (camera.position.y < MIN_SEA_LEVEL) camera.position.y = MIN_SEA_LEVEL
    }
    if (camera.position.y > MAX_ALTITUDE) camera.position.y = MAX_ALTITUDE

    if (camera.rotation.z !== 0) camera.rotation.z = 0

    saveTimerRef.current += delta
    if (saveTimerRef.current > 1.0) {
      saveTimerRef.current = 0
      try {
        localStorage.setItem(CAM_LS_KEY, JSON.stringify({
          x: camera.position.x, y: camera.position.y, z: camera.position.z,
          rx: camera.rotation.x, ry: camera.rotation.y,
        }))
      } catch { }
    }
  })
  return null
}

interface Props {
  world: WorldState | null
  hideUI: boolean
}

const SEL_LS_KEY = 'thb-3d-sel-v1'

export default function WorldView3D({ world, hideUI: _hideUI }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedOrgId  = useUIStore(s => s.selectedOrgId)
  const selectOrgStore = useUIStore(s => s.selectOrg)
  const viewFlags      = useUIStore(s => s.viewFlags)
  const [follow, setFollow] = useState(false)

  useEffect(() => {
    if (!world) return
    if (selectedOrgId) return
    try {
      const id = localStorage.getItem(SEL_LS_KEY)
      if (!id) return
      const live = (world.viewport_organisms ?? world.organisms ?? [])
        .some(o => o.id === id && o.alive)
      if (live) selectOrgStore(id)
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!world])

  useEffect(() => {
    try {
      if (selectedOrgId) localStorage.setItem(SEL_LS_KEY, selectedOrgId)
      else               localStorage.removeItem(SEL_LS_KEY)
    } catch { }
  }, [selectedOrgId])

  const didInitialAimRef = useRef(false)
  useEffect(() => {
    if (didInitialAimRef.current) return
    if (!world) return
    const live = (world.viewport_organisms ?? world.organisms ?? []).filter(o => o.alive)
    if (live.length < 5) return
    let hasSaved = false
    try {
      hasSaved = !!localStorage.getItem('thb-3d-cam-v1')
    } catch { }
    if (hasSaved) { didInitialAimRef.current = true; return }
    const cx = live.reduce((s, o) => s + o.x, 0) / live.length
    const cy = live.reduce((s, o) => s + o.y, 0) / live.length
    cameraCommand.teleport = {
      x: cx * TILE_SCALE,
      y: 80,
      z: cy * TILE_SCALE + 60,
    }
    didInitialAimRef.current = true
  }, [world])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const selectOrg = useUIStore(s => s.selectOrg)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        if (selectedOrgId) setFollow(prev => !prev)
      } else if (e.code === 'KeyJ' && !e.repeat) {
        if (selectedOrgId) {
          const [tx, ty] = getOrgXY(selectedOrgId)
          if (tx !== 0 || ty !== 0) {
            cameraCommand.teleport = {
              x: tx * TILE_SCALE,
              y: 30,
              z: ty * TILE_SCALE + 25,
            }
          }
        }
      } else if (e.code === 'KeyR' && !e.repeat) {
        const live = (world?.viewport_organisms ?? world?.organisms ?? []).filter(o => o.alive)
        if (live.length) {
          const pick = live[Math.floor(Math.random() * live.length)]
          selectOrg(pick.id)
          setFollow(true)
          const [tx, ty] = getOrgXY(pick.id)
          if (tx !== 0 || ty !== 0) {
            cameraCommand.teleport = {
              x: tx * TILE_SCALE,
              y: 30,
              z: ty * TILE_SCALE + 25,
            }
          }
        }
      } else if (e.code === 'Escape' && follow) {
        setFollow(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedOrgId, follow, selectOrg, world])

  useEffect(() => {
    cameraCommand.followOrgId = (follow && selectedOrgId) ? selectedOrgId : null
  }, [follow, selectedOrgId])

  const grid = world?.grid
  const ready = !!(grid?.depth_map && grid?.biomes && grid?.tiles && grid?.width && grid?.height)
  const dayProgress = world?.day_progress ?? 0.3
  const sunAlt   = Math.sin((dayProgress - 0.25) * 2 * Math.PI)
  const isNight  = sunAlt < 0

  // Hut world positions for Fireflies (computed once per grid change)
  const hutWorldPositions = useMemo<[number, number, number][]>(() => {
    if (!grid?.tiles || !grid?.depth_map || !grid?.biomes) return []
    const out: [number, number, number][] = []
    for (let row = 0; row < grid.height; row++) {
      const tRow = grid.tiles[row]; if (!tRow) continue
      for (let col = 0; col < grid.width; col++) {
        if (tRow[col] !== 8) continue
        const ground = heightAt(col, row, grid.depth_map, grid.biomes)
        out.push([col * TILE_SCALE, ground, row * TILE_SCALE])
      }
    }
    return out
  }, [grid?.tiles, grid?.depth_map, grid?.biomes])

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
                  pathTrail={grid.path_trail}
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
                <TribeLabels
                  organisms={world.organisms ?? []}
                  lineageNames={world.lineage_names}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <FireLights
                  tiles={grid.tiles!}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                  width={grid.width}
                  height={grid.height}
                  isNight={isNight}
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
                <Snow
                  active={world.season === 'scarcity'}
                  intensity={0.55 + (world.weather?.intensity ?? 0) * 0.4}
                />
                <AmbientMotes
                  isNight={isNight}
                  weatherKind={world.weather?.kind ?? 'clear'}
                />
                <Fireflies
                  hutPositions={hutWorldPositions}
                  isNight={isNight}
                />
                <SocialBeams
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                {viewFlags.territoryMap && world.territory && (
                  <TerritoryOverlay
                    territory={world.territory}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                  />
                )}
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

      {ready && <WorldHud />}

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

      {}
      <TimeOfDayTint
        dayProgress={dayProgress}
        weatherKind={world?.weather?.kind ?? 'clear'}
      />

      {}
      <div className="thb-3d-vignette" style={vignetteStyle} />

      <HelpOverlay />

      <div style={hudStyle}>
        click to look · WASD move · space/shift up/down · ctrl boost · F follow · J jump · R random · click map · esc release
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

const vignetteStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)',
  zIndex: 4,
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
