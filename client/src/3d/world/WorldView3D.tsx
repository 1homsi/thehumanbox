import { Suspense, useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  KeyboardControls,
  useKeyboardControls,
  PointerLockControls,
  OrbitControls,
  Stats,
} from '@react-three/drei'
import { Vector3, TOUCH, PCFSoftShadowMap, ACESFilmicToneMapping, SRGBColorSpace, type Camera } from 'three'
import type { WorldState } from '../../types'
import { useUIStore } from '../../stores/store'
import { Terrain } from './parts/Terrain'
import { Water } from './parts/Water'
import { Sun } from './parts/Sun'
import { Humans3D } from './parts/Humans3D'
import { Animals3D } from './parts/Animals3D'
import { Buildings3D } from './parts/Buildings3D'
import { BuildingSmoke3D } from './parts/BuildingSmoke3D'
import { OrgLabels } from './parts/OrgLabels'
import { TileFeatures } from './parts/TileFeatures'
import { Weather } from './parts/Weather'
import { Birds } from './parts/Birds'
import { Clouds3D } from './parts/Clouds3D'
import { Snow } from './parts/Snow'
import { ShootingStars } from './parts/ShootingStars'
import { Aurora } from './parts/Aurora'
import { GroundMist } from './parts/GroundMist'
import { Comet } from './parts/Comet'
import { ConstructionScaffolds } from './parts/ConstructionScaffolds'
import { BuildSparks } from './parts/BuildSparks'
import { Vehicles3D } from './parts/Vehicles3D'
import { Roads3D } from './parts/Roads3D'
import { Boats3D } from './parts/Boats3D'
import { Birds3D } from './parts/Birds3D'
import { DistantMountains } from './parts/DistantMountains'
import { Fireflies3D } from './parts/Fireflies3D'
import { Butterflies3D } from './parts/Butterflies3D'
import { Farms3D } from './parts/Farms3D'
import { WatchtowerBeams } from './parts/WatchtowerBeams'
import { IndustrySmoke } from './parts/IndustrySmoke'
import { DayClockDriver } from './parts/DayClockDriver'
import { HelpOverlay } from './parts/HelpOverlay'
import { AmbientMotes } from './parts/AmbientMotes'
import { MiniMap } from './parts/MiniMap'
import { CameraSync } from './parts/CameraSync'
import { SelectedOrgHighlight } from './parts/SelectedOrgHighlight'
import { SelectedOrgCard } from './parts/SelectedOrgCard'
import { WorldHud } from './parts/WorldHud'
import { EventFloaters } from './parts/EventFloaters'
import { BigMomentEffects } from './parts/BigMomentEffects'
import { OrgStateBadges } from './parts/OrgStateBadges'
import { FootstepDust } from './parts/FootstepDust'
import { WorkEffects3D } from './parts/WorkEffects3D'
import { ThoughtBubbles3D } from './parts/ThoughtBubbles3D'
import { GrassTufts } from './parts/GrassTufts'
import { TribeLabels } from './parts/TribeLabels'
import { FireLights } from './parts/FireLights'
import { normalizeLineageEras } from '../../utils/lineageEras'
import { LOW_PERF } from '../../lib/perf'
import { useSceneStore } from '../../stores/scene'
import { TimeOfDayTint } from './parts/TimeOfDayTint'
import { CinematicGrade } from './parts/CinematicGrade'
import { CameraBreath } from './parts/CameraBreath'
import { Fireflies } from './parts/Fireflies'
import { SocialBeams } from './parts/SocialBeams'
import { TerritoryOverlay } from './parts/TerritoryOverlay'
import { DataOverlays3D } from './parts/DataOverlays3D'
import { FocusMarkers3D } from './parts/FocusMarkers3D'
import { TILE_SCALE } from './parts/constants'
import { heightAtWorld, heightAt } from './parts/terrain-utils'
import { getOrgHeading, getOrgXY } from './parts/motion-state'
import { cameraCommand, type CameraLookAt, type CameraTeleport } from './parts/camera-state'

type MoveKeys = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'boost'

const KEY_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'back', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'up', keys: ['Space'] },
  { name: 'down', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'boost', keys: ['ControlLeft', 'ControlRight'] },
]

interface BuildingAABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
}

interface FlyCameraProps {
  depthMap?: number[][]
  biomes?: number[][]
  buildingAABBs?: BuildingAABB[]
  worldWidth?: number
  worldHeight?: number
}

const CAMERA_RADIUS = 1.6

const FLOOR_CLEARANCE = 0.8
const MIN_SEA_LEVEL = 0.6
const MAX_ALTITUDE = 900

const CAM_LS_KEY = 'thb-3d-cam-v1'

function worldCenter(width?: number, height?: number): CameraLookAt {
  return {
    x: ((width ?? 150) * TILE_SCALE) / 2,
    y: 10,
    z: ((height ?? 75) * TILE_SCALE) / 2,
  }
}

function defaultCameraPose(width?: number, height?: number): CameraTeleport {
  const center = worldCenter(width, height)
  const span = Math.max(width ?? 150, height ?? 75) * TILE_SCALE
  const dist = Math.min(340, span * 0.3)
  return {
    x: center.x,
    y: Math.max(130, dist * 0.7),
    z: center.z + dist,
    lookAt: { x: center.x, y: 0, z: center.z },
  }
}

function applyTeleport(camera: Camera, teleport: CameraTeleport) {
  camera.position.set(teleport.x, teleport.y, teleport.z)
  if (teleport.lookAt) {
    camera.up.set(0, 1, 0)
    camera.lookAt(teleport.lookAt.x, teleport.lookAt.y, teleport.lookAt.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.z = 0
  }
}

function clampCameraToWorld(camera: Camera, width?: number, height?: number) {
  if (!width || !height) return
  const maxX = Math.max(0, (width - 1) * TILE_SCALE)
  const maxZ = Math.max(0, (height - 1) * TILE_SCALE)
  const margin = TILE_SCALE * 20
  camera.position.x = Math.max(-margin, Math.min(maxX + margin, camera.position.x))
  camera.position.z = Math.max(-margin, Math.min(maxZ + margin, camera.position.z))
}

function loadSavedCam(): { x: number; y: number; z: number; rx: number; ry: number } | null {
  try {
    const raw = localStorage.getItem(CAM_LS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Record<string, unknown>
    if (!v || typeof v !== 'object') return null
    const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
    if (!num(v.x) || !num(v.y) || !num(v.z) || !num(v.rx) || !num(v.ry)) return null
    return { x: v.x, y: v.y, z: v.z, rx: v.rx, ry: v.ry }
  } catch {
    return null
  }
}

function intersectsAABB(x: number, y: number, z: number, b: BuildingAABB): boolean {
  return (
    x > b.minX - CAMERA_RADIUS &&
    x < b.maxX + CAMERA_RADIUS &&
    z > b.minZ - CAMERA_RADIUS &&
    z < b.maxZ + CAMERA_RADIUS &&
    y < b.maxY + 0.2
  )
}

function blockedAt(x: number, y: number, z: number, bs: BuildingAABB[] | undefined): boolean {
  if (!bs) return false
  for (const b of bs) {
    if (intersectsAABB(x, y, z, b)) return true
  }
  return false
}

function FlyCamera({ depthMap, biomes, buildingAABBs, worldWidth, worldHeight }: FlyCameraProps) {
  const [, get] = useKeyboardControls<MoveKeys>()
  const { camera } = useThree()
  const velocity = useRef(new Vector3())
  const saveTimerRef = useRef(0)
  // Reuse these across every useFrame call instead of `new`-ing three
  // Vector3s per frame at 60 Hz.
  const forwardScratch = useRef(new Vector3())
  const rightScratch = useRef(new Vector3())
  const followLookAt = useRef(new Vector3())
  const followInitialized = useRef(false)

  useEffect(() => {
    const saved = loadSavedCam()
    if (saved) {
      camera.position.set(saved.x, saved.y, saved.z)
      camera.rotation.order = 'YXZ'
      camera.rotation.set(saved.rx, saved.ry, 0, 'YXZ')
      clampCameraToWorld(camera, worldWidth, worldHeight)
    } else {
      applyTeleport(camera, defaultCameraPose(worldWidth, worldHeight))
    }
    camera.up.set(0, 1, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldWidth, worldHeight])

  useFrame((_, delta) => {
    if (cameraCommand.reset) {
      applyTeleport(camera, defaultCameraPose(worldWidth, worldHeight))
      cameraCommand.reset = false
      cameraCommand.followOrgId = null
      cameraCommand.povOrgId = null
    }

    if (cameraCommand.teleport) {
      applyTeleport(camera, cameraCommand.teleport)
      cameraCommand.teleport = null
    }

    const k = get()
    const userDriving = k.forward || k.back || k.left || k.right || k.up || k.down
    const trackedOrgId = cameraCommand.povOrgId ?? cameraCommand.followOrgId
    if (trackedOrgId && !userDriving) {
      const pov = !!cameraCommand.povOrgId
      const [tx, ty] = getOrgXY(trackedOrgId)
      if (tx !== 0 || ty !== 0) {
        const wx = tx * TILE_SCALE
        const wz = ty * TILE_SCALE
        const heading = getOrgHeading(trackedOrgId)
        const headingX = Math.sin(heading)
        const headingZ = Math.cos(heading)
        const sideX = headingZ
        const sideZ = -headingX
        const targetX = pov ? wx + headingX * 0.35 : wx - headingX * 15 + sideX * 3.5
        const targetZ = pov ? wz + headingZ * 0.35 : wz - headingZ * 15 + sideZ * 3.5
        const groundY = depthMap && biomes ? heightAt(tx, ty, depthMap, biomes) : 0
        const targetY = groundY + (pov ? 1.5 : 7.2)
        const look = followLookAt.current
        const lookX = wx + headingX * (pov ? 12 : 5)
        const lookY = groundY + (pov ? 1.3 : 1.6)
        const lookZ = wz + headingZ * (pov ? 12 : 5)
        if (!followInitialized.current) {
          look.set(lookX, lookY, lookZ)
          followInitialized.current = true
        }
        const lerp = 1 - Math.exp(-4.5 * delta)
        camera.position.x += (targetX - camera.position.x) * lerp
        camera.position.y += (targetY - camera.position.y) * lerp
        camera.position.z += (targetZ - camera.position.z) * lerp
        const lookLerp = 1 - Math.exp(-7 * delta)
        look.x += (lookX - look.x) * lookLerp
        look.y += (lookY - look.y) * lookLerp
        look.z += (lookZ - look.z) * lookLerp
        camera.lookAt(look)
        camera.rotation.order = 'YXZ'
        camera.rotation.z = 0
      }
    } else {
      followInitialized.current = false
    }

    const speed = 30 * (k.boost ? 4 : 1)

    const forward = forwardScratch.current
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = rightScratch.current.crossVectors(forward, camera.up).normalize()

    velocity.current.set(0, 0, 0)
    if (k.forward) velocity.current.add(forward)
    if (k.back) velocity.current.sub(forward)
    if (k.right) velocity.current.add(right)
    if (k.left) velocity.current.sub(right)
    if (k.up) velocity.current.y += 1
    if (k.down) velocity.current.y -= 1

    if (velocity.current.lengthSq() > 0) {
      velocity.current.normalize().multiplyScalar(speed * delta)
      if (buildingAABBs && buildingAABBs.length > 0) {
        const stepX = velocity.current.x
        const stepZ = velocity.current.z
        const stepY = velocity.current.y
        const y0 = camera.position.y + stepY
        const tryX = camera.position.x + stepX
        const tryZ = camera.position.z + stepZ
        if (!blockedAt(tryX, y0, camera.position.z, buildingAABBs)) {
          camera.position.x = tryX
        }
        if (!blockedAt(camera.position.x, y0, tryZ, buildingAABBs)) {
          camera.position.z = tryZ
        }
        camera.position.y += stepY
      } else {
        camera.position.add(velocity.current)
      }
    }

    if (depthMap && biomes) {
      const groundY = heightAtWorld(camera.position.x, camera.position.z, depthMap, biomes)
      const minY = Math.max(groundY, 0) + FLOOR_CLEARANCE
      if (camera.position.y < minY) camera.position.y = minY
      if (camera.position.y < MIN_SEA_LEVEL) camera.position.y = MIN_SEA_LEVEL
    }
    if (camera.position.y > MAX_ALTITUDE) camera.position.y = MAX_ALTITUDE
    clampCameraToWorld(camera, worldWidth, worldHeight)

    if (camera.rotation.z !== 0) camera.rotation.z = 0

    saveTimerRef.current += delta
    if (saveTimerRef.current > 1.0) {
      saveTimerRef.current = 0
      try {
        localStorage.setItem(
          CAM_LS_KEY,
          JSON.stringify({
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            rx: camera.rotation.x,
            ry: camera.rotation.y,
          }),
        )
      } catch {
        /* ignore */
      }
    }
  })
  return null
}

interface Props {
  world: WorldState | null
  // hideUI is passed by the parent for symmetry with the 2D view's
  // chrome control, but the 3D view doesn't have a separate HUD to
  // hide - its in-canvas chrome is governed by viewFlags below.
  // Kept on the prop interface for API stability; intentionally
  // ignored here.
  hideUI?: boolean
  sandboxArmed?: boolean
  onSandboxApply?: (worldX: number, worldY: number) => void
  onContextLost?: () => void
}

const SEL_LS_KEY = 'thb-3d-sel-v1'

export default function WorldView3D({ world, sandboxArmed, onSandboxApply, onContextLost }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contextLostRef = useRef(onContextLost)
  contextLostRef.current = onContextLost
  const contextWatchdog = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (contextWatchdog.current !== null) window.clearTimeout(contextWatchdog.current)
    },
    [],
  )
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const selectOrgStore = useUIStore((s) => s.selectOrg)
  // WorldView3D only reads one flag (territoryMap). Subscribing to
  // the whole viewFlags object re-renders the entire 3D tree on
  // every flag toggle; a scalar selector is virtually free.
  const showTerritoryMap = useUIStore((s) => s.viewFlags.territoryMap)
  const orgPov = useUIStore((s) => s.viewFlags.orgPov)
  const showNames = useUIStore((s) => s.viewFlags.names)
  const showAnimals = useUIStore((s) => s.viewFlags.animals)
  const showFps = useUIStore((s) => s.viewFlags.fps)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const [follow, setFollow] = useState(false)

  // Touch detection - PointerLockControls requires a mouse, so on touch
  // devices fall back to OrbitControls (drag to orbit, pinch to zoom).
  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false
    const hasTouchEvent = 'ontouchstart' in window
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
    return hasTouchEvent || coarsePointer
  }, [])

  useEffect(() => {
    if (!world) return
    if (selectedOrgId) return
    try {
      const id = localStorage.getItem(SEL_LS_KEY)
      if (!id) return
      const live = (world.viewport_organisms ?? world.organisms ?? []).some((o) => o.id === id && o.alive)
      if (live) selectOrgStore(id)
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!world])

  useEffect(() => {
    try {
      if (selectedOrgId) localStorage.setItem(SEL_LS_KEY, selectedOrgId)
      else localStorage.removeItem(SEL_LS_KEY)
    } catch {
      /* ignore */
    }
  }, [selectedOrgId])

  const didInitialAimRef = useRef(false)
  useEffect(() => {
    if (didInitialAimRef.current) return
    if (!world) return
    const live = (world.viewport_organisms ?? world.organisms ?? []).filter((o) => o.alive)
    if (live.length < 5) return
    let hasSaved = false
    try {
      hasSaved = !!localStorage.getItem('thb-3d-cam-v1')
    } catch {
      /* ignore */
    }
    if (hasSaved) {
      didInitialAimRef.current = true
      return
    }
    const cx = live.reduce((s, o) => s + o.x, 0) / live.length
    const cy = live.reduce((s, o) => s + o.y, 0) / live.length
    cameraCommand.teleport = {
      x: cx * TILE_SCALE,
      y: 80,
      z: cy * TILE_SCALE + 60,
      lookAt: {
        x: cx * TILE_SCALE,
        y: 8,
        z: cy * TILE_SCALE,
      },
    }
    didInitialAimRef.current = true
  }, [world])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const selectOrg = useUIStore((s) => s.selectOrg)

  useEffect(() => {
    const MOVE_CODES = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'ShiftLeft',
      'ShiftRight',
    ])
    const onKey = (e: KeyboardEvent) => {
      if (follow && MOVE_CODES.has(e.code)) {
        setFollow(false)
        return
      }
      if (e.code === 'KeyF' && !e.repeat) {
        if (selectedOrgId) setFollow((prev) => !prev)
      } else if (e.code === 'KeyJ' && !e.repeat) {
        if (selectedOrgId) {
          const [tx, ty] = getOrgXY(selectedOrgId)
          if (tx !== 0 || ty !== 0) {
            cameraCommand.teleport = {
              x: tx * TILE_SCALE,
              y: 30,
              z: ty * TILE_SCALE + 25,
              lookAt: {
                x: tx * TILE_SCALE,
                y: 4,
                z: ty * TILE_SCALE,
              },
            }
          }
        }
      } else if (e.code === 'KeyR' && !e.repeat) {
        const live = (world?.viewport_organisms ?? world?.organisms ?? []).filter((o) => o.alive)
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
              lookAt: {
                x: tx * TILE_SCALE,
                y: 4,
                z: ty * TILE_SCALE,
              },
            }
          }
        }
      } else if (e.code === 'KeyC' && !e.repeat) {
        setFollow(false)
        cameraCommand.reset = true
      } else if (e.code === 'Escape' && follow) {
        setFollow(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedOrgId, follow, selectOrg, world])

  useEffect(() => {
    cameraCommand.followOrgId = follow && selectedOrgId ? selectedOrgId : null
  }, [follow, selectedOrgId])

  useEffect(() => {
    cameraCommand.povOrgId = orgPov && selectedOrgId ? selectedOrgId : null
    return () => {
      cameraCommand.povOrgId = null
    }
  }, [orgPov, selectedOrgId])

  const grid = world?.grid
  const ready = !!(grid?.depth_map && grid?.biomes && grid?.tiles && grid?.width && grid?.height)
  const serverDayProgress = world?.day_progress ?? 0.3
  const [dayProgress, setDayProgress] = useState<number>(serverDayProgress)
  const lineageErasMap = useMemo(() => normalizeLineageEras(world?.lineage_eras), [world?.lineage_eras])
  const sunAlt = Math.sin((dayProgress - 0.25) * 2 * Math.PI)
  const isNight = sunAlt < 0

  const handleTilePick = useCallback(
    (x: number, y: number) => {
      if (!world?.grid) return
      if (sandboxArmed && onSandboxApply) {
        onSandboxApply(x + (world.grid.origin_x ?? 0), y + (world.grid.origin_y ?? 0))
        return
      }
      const tx = Math.floor(x)
      const ty = Math.floor(y)
      const tileVal = world.grid.tiles?.[ty]?.[tx]
      const structVal = world.grid.structure?.[ty]?.[tx] ?? 0
      if (tileVal !== 8 && structVal < 0.35) return
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms ?? []) {
        if (!org.alive) continue
        if (Math.floor(org.home_x) === tx && Math.floor(org.home_y) === ty) {
          if (!bestHost || org.age > bestHost.age) bestHost = { id: org.id, age: org.age }
        }
      }
      if (bestHost) useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
    },
    [world, sandboxArmed, onSandboxApply],
  )

  // Hut world positions for Fireflies (computed once per grid change)
  const hutWorldPositions = useMemo<[number, number, number][]>(() => {
    if (!grid?.tiles || !grid?.depth_map || !grid?.biomes) return []
    const out: [number, number, number][] = []
    for (let row = 0; row < grid.height; row++) {
      const tRow = grid.tiles[row]
      if (!tRow) continue
      for (let col = 0; col < grid.width; col++) {
        if (tRow[col] !== 8) continue
        const ground = heightAt(col, row, grid.depth_map, grid.biomes)
        out.push([col * TILE_SCALE, ground, row * TILE_SCALE])
      }
    }
    return out
  }, [grid?.tiles, grid?.depth_map, grid?.biomes, grid?.height, grid?.width])

  const buildingAABBs = useMemo<BuildingAABB[]>(() => {
    if (!grid?.tiles || !grid?.depth_map || !grid?.biomes) return []
    const out: BuildingAABB[] = []
    const tiles = grid.tiles
    for (let row = 0; row < grid.height; row++) {
      const tRow = tiles[row]
      if (!tRow) continue
      for (let col = 0; col < grid.width; col++) {
        if (tRow[col] !== 8) continue
        const ground = heightAt(col, row, grid.depth_map, grid.biomes)
        const cx = col * TILE_SCALE
        const cz = row * TILE_SCALE
        const half = TILE_SCALE * 0.55
        out.push({
          minX: cx - half,
          maxX: cx + half,
          minZ: cz - half,
          maxZ: cz + half,
          minY: ground,
          maxY: ground + 6.5,
        })
      }
    }
    for (const b of world?.buildings ?? []) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      const fp = (b.footprint ?? [2, 2]) as [number, number]
      const ground = heightAt(b.x, b.y, grid.depth_map, grid.biomes)
      const cx = b.x * TILE_SCALE
      const cz = b.y * TILE_SCALE
      const halfW = fp[0] * TILE_SCALE * 0.55
      const halfD = fp[1] * TILE_SCALE * 0.55
      out.push({
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: cz - halfD,
        maxZ: cz + halfD,
        minY: ground,
        maxY: ground + 8.0,
      })
    }
    return out
  }, [grid?.tiles, grid?.depth_map, grid?.biomes, grid?.height, grid?.width, world?.buildings])

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
          camera={{ position: [cx - 80, 95, cz + 220], fov: 58, near: 0.5, far: 4000 }}
          shadows={LOW_PERF ? false : { type: PCFSoftShadowMap }}
          dpr={LOW_PERF ? [1, 1.5] : [1, 2]}
          gl={{ antialias: !LOW_PERF, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 0.95
            gl.outputColorSpace = SRGBColorSpace
            const dom = gl.domElement
            dom.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              if (contextWatchdog.current !== null) window.clearTimeout(contextWatchdog.current)
              contextWatchdog.current = window.setTimeout(() => {
                contextWatchdog.current = null
                contextLostRef.current?.()
              }, 6000)
            })
            dom.addEventListener('webglcontextrestored', () => {
              if (contextWatchdog.current !== null) {
                window.clearTimeout(contextWatchdog.current)
                contextWatchdog.current = null
              }
            })
            const orig = dom.requestPointerLock?.bind(dom)
            if (orig) {
              dom.requestPointerLock = (opts?: PointerLockOptions) => {
                try {
                  if (dom.ownerDocument.pointerLockElement === dom) {
                    return Promise.resolve()
                  }
                  const r = orig(opts) as unknown
                  if (r && typeof (r as Promise<void>).catch === 'function') {
                    return (r as Promise<void>).catch(() => {})
                  }
                  return Promise.resolve()
                } catch {
                  return Promise.resolve()
                }
              }
            }
          }}
        >
          <Suspense fallback={null}>
            {ready && grid && (
              <>
                <DayClockDriver target={serverDayProgress} onTick={setDayProgress} />
                <Sun
                  dayProgress={dayProgress}
                  width={grid.width}
                  height={grid.height}
                  weatherKind={world.weather?.kind ?? 'clear'}
                  weatherIntensity={world.weather?.intensity ?? 0}
                  moonIllum={world.cosmos?.moon_illum ?? 0.7}
                />
                <Birds3D width={grid.width} height={grid.height} dayProgress={dayProgress} />
                <DistantMountains width={grid.width} height={grid.height} />
                <Fireflies3D
                  width={grid.width}
                  height={grid.height}
                  tiles={grid.tiles}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                  dayProgress={dayProgress}
                />
                <Butterflies3D
                  width={grid.width}
                  height={grid.height}
                  tiles={grid.tiles}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                  dayProgress={dayProgress}
                />
                <Terrain
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                  width={grid.width}
                  height={grid.height}
                  season={world.season}
                  pathTrail={grid.path_trail}
                  onTilePick={handleTilePick}
                />
                <Water
                  width={grid.width}
                  height={grid.height}
                  depthMap={grid.depth_map!}
                  dayProgress={dayProgress}
                />
                <TileFeatures
                  tiles={grid.tiles!}
                  biomes={grid.biomes!}
                  depthMap={grid.depth_map!}
                  width={grid.width}
                  height={grid.height}
                  pathTrail={grid.path_trail}
                />
                <GrassTufts
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
                  lineageEras={lineageErasMap}
                />
                <Buildings3D
                  buildings={world.buildings ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                  dayProgress={dayProgress}
                  lineageEras={lineageErasMap}
                />
                <BuildingSmoke3D
                  buildings={world.buildings ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                {showAnimals && (
                  <Animals3D
                    animals={world.viewport_animals ?? world.animals ?? []}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                  />
                )}
                {showNames && (
                  <OrgLabels
                    organisms={world.viewport_organisms ?? world.organisms ?? []}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                  />
                )}
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
                <BigMomentEffects
                  events={world.events ?? []}
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  world={world}
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
                <WorkEffects3D
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                <ThoughtBubbles3D
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
                <Weather kind={world.weather?.kind ?? 'clear'} intensity={world.weather?.intensity ?? 0} />
                <Birds
                  width={grid.width}
                  height={grid.height}
                  isNight={isNight}
                  weatherKind={world.weather?.kind ?? 'clear'}
                />
                <Clouds3D
                  width={grid.width}
                  height={grid.height}
                  dayProgress={dayProgress}
                  weatherKind={world.weather?.kind ?? 'clear'}
                  intensity={world.weather?.intensity ?? 0}
                />
                <Snow
                  active={world.season === 'scarcity'}
                  intensity={0.55 + (world.weather?.intensity ?? 0) * 0.4}
                />
                <ShootingStars isNight={isNight} width={grid.width} height={grid.height} />
                <Aurora isNight={isNight} season={world.season} width={grid.width} height={grid.height} />
                <GroundMist
                  dayProgress={dayProgress}
                  width={grid.width}
                  height={grid.height}
                  weatherKind={world.weather?.kind ?? 'clear'}
                />
                <Comet
                  isNight={isNight}
                  dayOfYear={world.cosmos?.day_of_year}
                  width={grid.width}
                  height={grid.height}
                />
                <ConstructionScaffolds
                  buildings={world.buildings}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                />
                <BuildSparks buildings={world.buildings} depthMap={grid.depth_map} biomes={grid.biomes} />
                <Vehicles3D
                  buildings={world.buildings}
                  lineageEras={lineageErasMap}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                  isNight={isNight}
                />
                <Roads3D
                  buildings={world.buildings}
                  lineageEras={lineageErasMap}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                />
                <Boats3D
                  tiles={grid.tiles}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                  width={grid.width}
                  height={grid.height}
                />
                <Farms3D buildings={world.buildings} depthMap={grid.depth_map} biomes={grid.biomes} />
                <WatchtowerBeams
                  buildings={world.buildings}
                  depthMap={grid.depth_map}
                  biomes={grid.biomes}
                  isNight={isNight}
                />
                <IndustrySmoke buildings={world.buildings} depthMap={grid.depth_map} biomes={grid.biomes} />
                <AmbientMotes isNight={isNight} weatherKind={world.weather?.kind ?? 'clear'} />
                <Fireflies hutPositions={hutWorldPositions} isNight={isNight} />
                <SocialBeams
                  organisms={world.viewport_organisms ?? world.organisms ?? []}
                  depthMap={grid.depth_map!}
                  biomes={grid.biomes!}
                />
                {showTerritoryMap && world.territory && (
                  <TerritoryOverlay
                    territory={world.territory}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                  />
                )}
                {focus !== 'all' && (
                  <FocusMarkers3D
                    focus={focus}
                    organisms={world.viewport_organisms ?? world.organisms ?? []}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                  />
                )}
                {overlay && (
                  <DataOverlays3D
                    overlay={overlay}
                    world={world}
                    depthMap={grid.depth_map!}
                    biomes={grid.biomes!}
                    width={grid.width}
                    height={grid.height}
                  />
                )}
              </>
            )}
            <CinematicGrade dayProgress={dayProgress} weatherKind={world?.weather?.kind ?? 'clear'} />
            <FlyCamera
              depthMap={grid?.depth_map}
              biomes={grid?.biomes}
              buildingAABBs={buildingAABBs}
              worldWidth={grid?.width}
              worldHeight={grid?.height}
            />
            <CameraBreath enabled={!isTouch} />
            <CameraSync />
            {showFps && <Stats />}
            {isTouch ? (
              <OrbitControls enableDamping touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} />
            ) : (
              <PointerLockControls />
            )}
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {ready && grid && (
        <SelectedOrgCard
          organisms={world.viewport_organisms ?? world.organisms ?? []}
          following={follow}
          onToggleFollow={() => setFollow((prev) => !prev)}
          showKeyHints={!isTouch}
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

      {!ready && <div style={loadingStyle}>loading terrain…</div>}

      {}
      <TimeOfDayTint dayProgress={dayProgress} weatherKind={world?.weather?.kind ?? 'clear'} />

      {}
      <div className="thb-3d-vignette" style={vignetteStyle} />

      <HelpOverlay />

      <div style={hudStyle}>
        {isTouch
          ? 'drag to orbit · pinch to zoom'
          : 'click to look · WASD move · space/shift up/down · ctrl boost · C reset · F follow · J jump · R random · click map · esc release'}
        {follow && selectedOrgId && <span style={{ color: '#ff8a3a', marginLeft: 10 }}>· following</span>}
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
  background:
    'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.30) 80%, rgba(0,0,0,0.62) 100%)',
  mixBlendMode: 'multiply',
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
