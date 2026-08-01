import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Game,
  World,
  Entity,
  Transform,
  Sprite,
  Camera2D,
  useCamera,
  useEntity,
  useDynamicCanvas,
  useGestures,
  type GameControls,
} from 'cubeforge'
import type { AnimalState, OrganismState, WorldState } from '../../types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore, type ViewFlags } from '../../stores/store'
import { lineageColor, cbFireRgba } from '../../utils/constants'
import {
  ATLAS_TOWN,
  onAnyAtlasLoaded,
  drawPeopleTile,
  pickAnimalTile,
  pickHumanSprite,
  ATLAS_CREATURE,
  drawTile,
} from '../../utils/sprites'
import { compareBuildingsByDepth, drawBuilding } from './buildings2d'
import { getBuildingSprite, PAD as SPRITE_PAD, PAD_BOT as SPRITE_PAD_BOT } from './building-sprites'
import { normalizeLineageEras } from '../../utils/lineageEras'
import { useSceneStore } from '../../stores/scene'
import { farmCropColor, farmProgress, farmStage } from '../../world/farms'
import { activeStrategy, strategyTimeLabel } from '../../world/strategy-visuals'
import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../world/terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  baseTerrainTile,
  permanentWaterDepth,
  permanentWaterLandEdgeMask,
  terrainVisualSignature,
} from '../../world/terrain-visuals'
import { getBuildingState, hasRuinedBuildingAtWorldTile, isRuinedBuilding } from '../../world/building-state'
import {
  buildTerritoryIndex,
  lineageAtTerritoryTile,
  territoryEmphasis,
  territoryStanding,
  territoryTileKey,
} from '../../world/territory'

import { LOW_PERF } from '../../lib/perf'
import { syncRendererLoopPause } from '../../lib/desktopVisibility'
import { deterministicAppearanceIndex, resolveAgeStage, zoomDetailLevel } from './character-visuals'

const _orgLastPos = new Map<string, { x: number; y: number; movedAt: number; phase: number }>()
const _animalLastPos = new Map<number, { x: number; y: number; movedAt: number }>()
function orgAnimPhase(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 800
}
function orgFrame(id: string, x: number, y: number, now: number): number {
  const last = _orgLastPos.get(id)
  let movedAt = last?.movedAt ?? 0
  let phase = last?.phase
  if (phase == null) phase = orgAnimPhase(id)
  if (!last || Math.abs(last.x - x) > 0.02 || Math.abs(last.y - y) > 0.02) {
    movedAt = now
    _orgLastPos.set(id, { x, y, movedAt, phase })
  }
  if (now - movedAt > 350) return 0
  return Math.floor(((now + phase) % 800) / 200)
}

function animalIsMoving(id: number, x: number, y: number, now: number): boolean {
  const last = _animalLastPos.get(id)
  if (!last) {
    _animalLastPos.set(id, { x, y, movedAt: 0 })
    return false
  }
  if (Math.abs(last.x - x) > 0.02 || Math.abs(last.y - y) > 0.02) {
    _animalLastPos.set(id, { x, y, movedAt: now })
    return true
  }
  return now - last.movedAt < 320
}

interface OrgInterpCache {
  source: OrganismState[] | null
  prevSource: OrganismState[] | null
  frameId: number
  items: OrganismState[]
  prevById: Map<string, OrganismState>
}

interface AnimalInterpCache {
  source: AnimalState[] | null
  prevSource: AnimalState[] | null
  frameId: number
  items: AnimalState[]
  prevById: Map<number, AnimalState>
}

const ERA_STRIPE_COLOR: Record<string, string> = {
  bronze: '#b07a2a',
  iron: '#7a7a7a',
  classical: '#d4a04a',
  medieval: '#5a4030',
  renaissance: '#c08850',
  industrial: '#3e2e22',
  modern: '#9aa0a8',
  information: '#7cc6ff',
}

function pickToolEmoji(tools: Record<string, number> | undefined): string {
  if (!tools) return ''
  if (tools.rifle || tools.musket) return '\u{1F52B}'
  if (tools.iron_sword) return '\u{2694}\u{FE0F}'
  if (tools.bronze_spear || tools.stone_spear) return '\u{1F3F9}'
  if (tools.bow || tools.crossbow) return '\u{1F3F9}'
  if (tools.computer) return '\u{1F4BB}'
  if (tools.book) return '\u{1F4D6}'
  if (tools.hammer || tools.saw) return '\u{1F528}'
  if (tools.plow) return '\u{1F69C}'
  return ''
}

const SPECIALTY_EMOJI: Record<string, string> = {
  farmer: '\u{1F33E}',
  smith: '\u{1F528}',
  hunter: '\u{1F3F9}',
  healer: '\u{2695}\u{FE0F}',
  scholar: '\u{1F4DC}',
  merchant: '\u{1F4B0}',
  soldier: '\u{2694}\u{FE0F}',
  builder: '\u{1F3D7}\u{FE0F}',
  priest: '\u{1F4FF}',
  artist: '\u{1F3A8}',
  engineer: '\u{2699}\u{FE0F}',
  sailor: '\u{26F5}',
  miner: '\u{26CF}\u{FE0F}',
  weaver: '\u{1F9F5}',
  baker: '\u{1F35E}',
  brewer: '\u{1F37A}',
  carpenter: '\u{1FA9C}',
  mason: '\u{1F9F1}',
  scribe: '\u{270D}\u{FE0F}',
  banker: '\u{1F3E6}',
  doctor: '\u{1F489}',
  teacher: '\u{1F4DA}',
  lawyer: '\u{2696}\u{FE0F}',
  officer: '\u{1F46E}',
  pilot: '\u{2708}\u{FE0F}',
  programmer: '\u{1F4BB}',
  journalist: '\u{1F4F0}',
  actor: '\u{1F3AD}',
  athlete: '\u{1F3C5}',
  politician: '\u{1F3DB}\u{FE0F}',
}

function drawCanineSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: 'wolf' | 'dog',
  flipped: boolean,
  step: number,
) {
  const unit = Math.max(1, Math.floor(size / 14))
  const spriteWidth = 14 * unit
  const spriteHeight = 14 * unit
  const left = Math.round(cx - spriteWidth / 2)
  const top = Math.round(cy - spriteHeight / 2)
  const outline = '#261d20'
  const fur = kind === 'wolf' ? '#677483' : '#a8643f'
  const highlight = kind === 'wolf' ? '#a8b3bc' : '#d49a66'
  const dark = kind === 'wolf' ? '#3d4854' : '#6f3c2b'
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x * unit, y * unit, width * unit, height * unit)
  }

  ctx.save()
  ctx.translate(flipped ? left + spriteWidth : left, top)
  if (flipped) ctx.scale(-1, 1)

  // Tail, body and head share an outline so both animals read clearly
  // against grass, sand and snow at the world camera scale.
  rect(0, 4, 4, 3, outline)
  rect(1, 4, 3, 1, fur)
  rect(2, 5, 2, 1, highlight)
  rect(3, 4, 8, 6, outline)
  rect(4, 5, 6, 4, fur)
  rect(4, 8, 6, 1, dark)
  rect(9, 2, 5, 7, outline)
  rect(10, 3, 3, 5, fur)
  rect(9, 0, 2, 3, outline)
  rect(12, 1, 2, 3, outline)
  rect(10, 1, 1, 2, dark)
  rect(12, 2, 1, 2, dark)
  rect(12, 5, 2, 2, highlight)
  rect(13, 5, 1, 1, '#171317')
  rect(11, 4, 1, 1, '#f1d37b')

  const frontFoot = step % 2 === 0 ? 0 : 1
  const backFoot = step % 2 === 0 ? 1 : 0
  rect(4, 9, 2, 4, outline)
  rect(5, 9, 1, 3, fur)
  rect(4 - backFoot, 12, 3, 1, outline)
  rect(8, 9, 2, 4, outline)
  rect(9, 9, 1, 3, fur)
  rect(8 + frontFoot, 12, 3, 1, outline)

  if (kind === 'dog') {
    rect(9, 6, 4, 1, '#e95b55')
    rect(10, 7, 1, 1, '#f2c84b')
  }
  ctx.restore()
}

function visualTileHash(col: number, row: number, salt = 0): number {
  let hash = (col * 374761393 + row * 668265263 + salt * 1274126177) | 0
  hash = ((hash ^ (hash >>> 13)) * 1274126177) | 0
  return hash >>> 0
}

function drawFoodPatch(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  const berry = (seed & 1) === 0 ? '#e25757' : '#e2bd45'
  ctx.fillStyle = '#244d2a'
  ctx.fillRect(px + 2, py + 3, 5, 3)
  ctx.fillRect(px + 3, py + 2, 3, 5)
  ctx.fillStyle = '#4f8a43'
  ctx.fillRect(px + 2, py + 3, 2, 2)
  ctx.fillRect(px + 5, py + 2, 2, 2)
  ctx.fillStyle = berry
  ctx.fillRect(px + 3 + ((seed >>> 4) & 1), py + 3, 1, 1)
  ctx.fillRect(px + 5, py + 5, 1, 1)
}

function drawMineralOutcrop(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  ctx.fillStyle = '#3d3937'
  ctx.fillRect(px + 1, py + 5, 7, 2)
  ctx.fillRect(px + 2, py + 3, 5, 3)
  ctx.fillRect(px + 4, py + 2, 3, 2)
  ctx.fillStyle = '#716a62'
  ctx.fillRect(px + 3, py + 3, 2, 1)
  ctx.fillRect(px + 5, py + 4, 2, 1)
  ctx.fillStyle = (seed & 1) === 0 ? '#e2b84d' : '#7fc9c7'
  ctx.fillRect(px + 5, py + 3, 1, 1)
  ctx.fillRect(px + 3, py + 5, 1, 1)
}

function drawPixelFire(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  intensity: number,
  frame: number,
  campfire: boolean,
) {
  const strength = Math.max(0.2, Math.min(1, intensity))
  const shift = frame & 1
  if (campfire) {
    ctx.fillStyle = '#3b2418'
    ctx.fillRect(px + 1, py + 6, 6, 2)
    ctx.fillStyle = '#82502a'
    ctx.fillRect(px + 2, py + 6, 2, 1)
    ctx.fillRect(px + 5, py + 7, 2, 1)
  } else {
    ctx.fillStyle = 'rgba(62,35,24,0.75)'
    ctx.fillRect(px + 1, py + 7, 6, 1)
  }

  ctx.fillStyle = cbFireRgba(204, 54, 16, 0.8 * strength)
  ctx.fillRect(px + 2, py + 3 + shift, 5, 4 - shift)
  ctx.fillStyle = cbFireRgba(255, 126, 24, 0.95 * strength)
  ctx.fillRect(px + 3 + shift, py + 2, 3, 4)
  ctx.fillStyle = cbFireRgba(255, 222, 92, strength)
  ctx.fillRect(px + 4, py + 3 - shift, 1, 3)
  if (strength > 0.55) {
    ctx.fillStyle = cbFireRgba(255, 164, 48, 0.75 * strength)
    ctx.fillRect(px + ((frame + 1) % 6), py + 1, 1, 1)
  }
}

import { TILE, TILE_RGB, BIOME_RGBA, THOUGHT_COLORS } from '../../world/palette'
import { orgVariant } from '../../world/org-variant'
import { drawTrees, drawClouds, drawNaturalDecor, scratchA, scratchB } from './decorations'

const fpsSamples: number[] = []

let _imgBuf: ImageData | null = null
let _baseCanvas: HTMLCanvasElement | null = null
let _ruinedBuildingSource: WorldState['buildings']
let _ruinedBuildingTiles = new Set<string>()
let _baseKey: {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  terrain_signature: number
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
} | null = null

function ruinedBuildingTiles(buildings: WorldState['buildings']): ReadonlySet<string> {
  if (buildings === _ruinedBuildingSource) return _ruinedBuildingTiles
  const tiles = new Set<string>()
  for (const building of buildings ?? []) {
    if (!isRuinedBuilding(building)) continue
    const footprintWidth = Math.max(1, Math.floor(building.footprint?.[0] ?? building.fw ?? 1))
    const footprintHeight = Math.max(1, Math.floor(building.footprint?.[1] ?? building.fh ?? 1))
    for (let dy = 0; dy < footprintHeight; dy++) {
      for (let dx = 0; dx < footprintWidth; dx++) {
        tiles.add(`${Math.floor(building.x + dx)},${Math.floor(building.y + dy)}`)
      }
    }
  }
  _ruinedBuildingSource = buildings
  _ruinedBuildingTiles = tiles
  return tiles
}

const MAX_TRADE_ROUTES_2D = 48
const MAX_CARAVANS_2D = 64

function cargoGlyph(cargo: string): string {
  const normalized = cargo.toLowerCase()
  if (normalized.includes('food') || normalized.includes('fruit')) return '🍎'
  if (normalized.includes('grain') || normalized.includes('wheat')) return '🌾'
  if (normalized.includes('wood') || normalized.includes('timber')) return '🪵'
  if (normalized.includes('stone') || normalized.includes('ore')) return '🪨'
  if (normalized.includes('water')) return '💧'
  if (normalized.includes('cloth') || normalized.includes('wool')) return '🧶'
  return '📦'
}

function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function drawTradeNetwork2D(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  now: number,
) {
  if (!world.trade_routes?.length && !world.caravans?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const margin = 8
  const isVisible = (x: number, y: number) =>
    x >= bounds.c0 - margin && x <= bounds.c1 + margin && y >= bounds.r0 - margin && y <= bounds.r1 + margin

  const visibleRoutes: NonNullable<WorldState['trade_routes']> = []
  for (const route of world.trade_routes ?? []) {
    if (!isFinitePoint(route.a_center) || !isFinitePoint(route.b_center)) continue
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy
    if (
      Math.max(ax, bx) < bounds.c0 - margin ||
      Math.min(ax, bx) > bounds.c1 + margin ||
      Math.max(ay, by) < bounds.r0 - margin ||
      Math.min(ay, by) > bounds.r1 + margin
    ) {
      continue
    }
    visibleRoutes.push(route)
    if (visibleRoutes.length >= MAX_TRADE_ROUTES_2D) break
  }

  type VisibleCaravan = {
    caravan: NonNullable<WorldState['caravans']>[number]
    localX: number
    localY: number
  }
  const visibleCaravans: VisibleCaravan[] = []
  for (const caravan of world.caravans ?? []) {
    if (!isFinitePoint(caravan.from) || !isFinitePoint(caravan.to)) continue
    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
    const localX = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - ox
    const localY = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - oy
    if (!isVisible(localX, localY)) continue
    visibleCaravans.push({ caravan, localX, localY })
    if (visibleCaravans.length >= MAX_CARAVANS_2D) break
  }

  if (visibleRoutes.length === 0 && visibleCaravans.length === 0) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([Math.max(4, TILE * 0.75), Math.max(3, TILE * 0.5)])

  for (const route of visibleRoutes) {
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy

    const startX = (ax + 0.5) * TILE
    const startY = (ay + 0.5) * TILE
    const endX = (bx + 0.5) * TILE
    const endY = (by + 0.5) * TILE
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY)
    gradient.addColorStop(0, lineageColor(route.lineage_a))
    gradient.addColorStop(1, lineageColor(route.lineage_b))
    ctx.globalAlpha = 0.3 + Math.min(0.2, Math.log2(route.deliveries + route.volume + 1) * 0.035)
    ctx.strokeStyle = gradient
    ctx.lineWidth = Math.min(2.25, 0.9 + Math.log2(route.deliveries + 1) * 0.15)
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.globalAlpha = 0.55
    for (const [x, y, lineage] of [
      [startX, startY, route.lineage_a],
      [endX, endY, route.lineage_b],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(2.25, TILE * 0.2), 0, Math.PI * 2)
      ctx.fillStyle = lineageColor(lineage)
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(12, 15, 18, 0.82)'
      ctx.stroke()
    }
    ctx.setLineDash([Math.max(4, TILE * 0.75), Math.max(3, TILE * 0.5)])
  }

  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.max(10, Math.round(TILE * 0.9))}px sans-serif`
  for (const { caravan, localX, localY } of visibleCaravans) {
    const px = (localX + 0.5) * TILE
    const py = (localY + 0.5) * TILE + Math.sin(now / 170 + caravan.id * 0.73) * 1.2
    const angle = Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0])
    const radius = Math.max(6, TILE * 0.48)
    ctx.save()
    ctx.translate(px, py)
    ctx.globalAlpha = 0.96
    ctx.fillStyle = 'rgba(11, 14, 16, 0.82)'
    ctx.beginPath()
    ctx.arc(0, 0, radius + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = lineageColor(caravan.sender_lineage)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.rotate(angle)
    ctx.fillStyle = lineageColor(caravan.sender_lineage)
    ctx.beginPath()
    ctx.moveTo(radius + 3, 0)
    ctx.lineTo(radius - 1, -3)
    ctx.lineTo(radius - 1, 3)
    ctx.closePath()
    ctx.fill()
    ctx.rotate(-angle)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(cargoGlyph(caravan.cargo), 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

onAnyAtlasLoaded(() => {
  _baseKey = null
})
function getReuseImgData(w: number, h: number): ImageData {
  if (!_imgBuf || _imgBuf.width !== w || _imgBuf.height !== h) {
    _imgBuf = new ImageData(w, h)
  }
  return _imgBuf
}

function baseLayerMatches(
  key: typeof _baseKey,
  width: number,
  height: number,
  origin_x: number,
  origin_y: number,
  tiles: number[][],
  terrain_signature: number,
  biomes?: number[][],
  depth_map?: number[][],
  season?: string,
) {
  return (
    !!key &&
    key.width === width &&
    key.height === height &&
    key.origin_x === origin_x &&
    key.origin_y === origin_y &&
    (key.tiles === tiles || key.terrain_signature === terrain_signature) &&
    key.biomes === biomes &&
    key.depth_map === depth_map &&
    key.season === season
  )
}

function vnHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash(xi, yi)
  const b = vnHash(xi + 1, yi)
  const c = vnHash(xi, yi + 1)
  const d = vnHash(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const SEASON_LAND_TINT: Record<string, { rgb: [number, number, number]; w: number }> = {
  abundance: { rgb: [58, 138, 66], w: 0.22 },
  recovery: { rgb: [92, 150, 64], w: 0.3 },
  decline: { rgb: [150, 118, 44], w: 0.42 },
  scarcity: { rgb: [128, 102, 56], w: 0.52 },
}

const SHALLOW_RGB: [number, number, number] = [116, 198, 208]

function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const W = width * TILE
  const H = height * TILE

  const season = world.season
  const terrain_signature =
    _baseKey?.tiles === tiles ? _baseKey.terrain_signature : terrainVisualSignature(tiles, width, height)
  if (
    _baseCanvas &&
    baseLayerMatches(
      _baseKey,
      width,
      height,
      origin_x,
      origin_y,
      tiles,
      terrain_signature,
      biomes,
      depth_map,
      season,
    )
  ) {
    if (_baseKey) _baseKey.tiles = tiles
    return _baseCanvas
  }

  const canvas =
    _baseCanvas && _baseCanvas.width === W && _baseCanvas.height === H
      ? _baseCanvas
      : document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const imgData = getReuseImgData(W, H)
  const d = imgData.data
  const varAmtFor = (tid: number): number => {
    if (tid === 2 || tid === 9) return 2
    if (tid === 1 || tid === 3) return 5
    if (tid === 5) return 8
    if (tid === 6) return 9
    if (tid === 12) return 3
    if (tid === 13) return 5
    return 4
  }
  const landTint = SEASON_LAND_TINT[season]
  for (let row = 0; row < height; row++) {
    const tileRow = tiles[row]
    const biomeRow = biomes?.[row]
    const depthRow = depth_map?.[row]
    const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
    const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
    for (let col = 0; col < width; col++) {
      const rawTid = tileRow?.[col] ?? TILE_ID.VOID
      const tid = baseTerrainTile(rawTid)
      const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
      let [r, g, b] = rgb

      const isWater = isWaterTile(rawTid)
      const isPermanentWater = isPermanentWaterTile(rawTid)
      const wN = tileRowPrev?.[col]
      const wS = tileRowNext?.[col]
      const wW = col > 0 ? tileRow?.[col - 1] : undefined
      const wE = tileRow?.[col + 1]
      const touchesLand =
        (wN !== undefined && !isWaterTile(wN)) ||
        (wS !== undefined && !isWaterTile(wS)) ||
        (wW !== undefined && !isWaterTile(wW)) ||
        (wE !== undefined && !isWaterTile(wE))

      const visualDepth = permanentWaterDepth(rawTid, depthRow?.[col])
      if (visualDepth !== null) {
        const t_ = 1 - Math.min(200, visualDepth) / 200
        r = (100 - t_ * 28) | 0
        g = (170 - t_ * 42) | 0
        b = (220 - t_ * 30) | 0
      }

      if (isPermanentWater && touchesLand) {
        r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
        g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
        b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
      }

      if (!isWater && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW) {
        const bm = biomeRow?.[col] ?? 0
        const bo = BIOME_RGBA[bm]
        if (bo) {
          const a = bo[3]
          if (a > 0) {
            const ia = 1 - a
            r = (r * ia + bo[0] * a) | 0
            g = (g * ia + bo[1] * a) | 0
            b = (b * ia + bo[2] * a) | 0
          }
        }
      }

      const macro = valueNoise(col / 42, row / 42) * 0.65 + valueNoise(col / 13 + 7, row / 13 + 7) * 0.35
      let shading = ((macro - 0.5) * (isWater ? 5 : 14)) | 0
      if (!isWater) {
        const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
        if (grassy && landTint) {
          let w = landTint.w * (0.55 + macro * 0.9)
          if (w > 0.85) w = 0.85
          const iw = 1 - w
          r = (r * iw + landTint.rgb[0] * w) | 0
          g = (g * iw + landTint.rgb[1] * w) | 0
          b = (b * iw + landTint.rgb[2] * w) | 0
          shading += ((macro - 0.5) * 8) | 0
        }
      }

      const varAmt = varAmtFor(tid)
      const bx = col * TILE,
        by = row * TILE
      for (let ty = 0; ty < TILE; ty++) {
        const gy = by + ty
        let pi = (gy * W + bx) * 4
        for (let tx = 0; tx < TILE; tx++, pi += 4) {
          const gx = bx + tx
          // Texture in small pixel-art clusters instead of independent
          // per-pixel static. The macro field shapes broad biome patches;
          // this 2x2 dither keeps nearby terrain readable at game scale.
          const clusterX = gx >> 1
          const clusterY = gy >> 1
          let h = (clusterX * 374761393 + clusterY * 668265263) | 0
          h = ((h ^ (h >>> 13)) * 1274126177) | 0
          const dither = ((gx ^ gy) & 1) === 0 ? -1 : 1
          const k = (((((h >>> 0) & 0xff) - 128) * varAmt) >> 7) + dither
          let rr = r + k + shading
          let gg = g + k + shading
          let bb = b + k + shading
          if (rr < 0) rr = 0
          else if (rr > 255) rr = 255
          if (gg < 0) gg = 0
          else if (gg > 255) gg = 255
          if (bb < 0) bb = 0
          else if (bb > 255) bb = 255
          d[pi] = rr
          d[pi + 1] = gg
          d[pi + 2] = bb
          d[pi + 3] = 255
        }
      }
    }
  }

  const baseCtx = canvas.getContext('2d')!
  baseCtx.imageSmoothingEnabled = false
  baseCtx.putImageData(imgData, 0, 0)
  if (biomes && ATLAS_TOWN.complete) {
    drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
  }
  if (biomes) {
    drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
  }
  _baseCanvas = canvas
  _baseKey = {
    width,
    height,
    origin_x,
    origin_y,
    tiles,
    terrain_signature,
    biomes,
    depth_map,
    season,
  }
  return canvas
}

function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
  cameraZoom = 1,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  const { food_trail, water_trail, path_trail, fertility, hazard } = world.grid
  if (!tiles || tiles.length < height) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  // Clip per-tile overlay loops to the visible window when bounds is
  // provided. Bounds is computed by the caller from camera + dims and
  // already includes a margin. When zoomed out (whole world visible)
  // the bounds collapse to the full grid, so this is a no-op.
  const r0 = bounds?.r0 ?? 0
  const r1 = bounds?.r1 ?? height
  const c0 = bounds?.c0 ?? 0
  const c1 = bounds?.c1 ?? width
  // Prefer the viewport-filtered list (smaller) but fall back to the
  // full cache when it's empty. `??` alone returns [] when viewport is
  // an empty array, which silently hid all animals if the wire ever
  // shipped a frame with `animals: []` even though the cache held many.
  const orgPick =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  const animalPick =
    world.viewport_animals && world.viewport_animals.length > 0
      ? world.viewport_animals
      : (world.animals ?? [])
  const organisms = orgPick
  const animals = animalPick
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()
  const ruinedTiles = ruinedBuildingTiles(world.buildings)
  ctx.imageSmoothingEnabled = false

  const base = getBaseLayerCanvas(world)
  if (!base) return
  ctx.drawImage(base, 0, 0)

  const sp = world.season_progress ?? 0.5
  const seasonTints: Record<string, [number, number, number, number]> = {
    decline: [180, 110, 30, 0.05 + sp * 0.06],
    scarcity: [95, 70, 40, 0.07 + sp * 0.07],
    recovery: [40, 130, 150, 0.04 + (1 - sp) * 0.05],
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) {
    ctx.fillStyle = `rgba(${skyTint[0]},${skyTint[1]},${skyTint[2]},${skyTint[3]})`
    ctx.fillRect(0, 0, W, H)
  }

  {
    const dp = world.day_progress ?? 0.5
    if (!world.is_day) {
      const mid = Math.max(0, 1 - Math.abs(dp - 0.85) * 4)
      ctx.fillStyle = `rgba(14,20,58,${0.22 + mid * 0.1})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(80,110,200,${0.05 + mid * 0.03})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp < 0.12) {
      const k = (0.12 - dp) / 0.12
      ctx.fillStyle = `rgba(255,160,80,${k * 0.14})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(120,80,160,${k * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp > 0.55) {
      const k = Math.min(1, (dp - 0.55) / 0.15)
      ctx.fillStyle = `rgba(235,120,60,${k * 0.15})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(150,70,140,${k * 0.05})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  if (world.weather && world.weather.kind !== 'clear') {
    const wi = Math.max(0, Math.min(1, world.weather.intensity ?? 0))
    const kind = world.weather.kind
    if (kind === 'storm') {
      ctx.fillStyle = `rgba(40,55,90,${0.06 + wi * 0.1})`
      ctx.fillRect(0, 0, W, H)
    } else if (kind === 'rain') {
      ctx.fillStyle = `rgba(70,90,130,${0.04 + wi * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = 'rgba(35,45,60,0.07)'
      ctx.fillRect(0, 0, W, H)
    }
    if (kind === 'rain' || kind === 'storm') {
      const isStorm = kind === 'storm'
      const wx = world.weather.wind_x ?? 0.4
      const wy = world.weather.wind_y ?? 0.0
      if (world.season === 'scarcity' && !isStorm) {
        ctx.fillStyle = `rgba(240,246,255,${0.35 + wi * 0.3})`
        const flakes = Math.round(90 * (0.4 + wi * 0.6))
        for (let i = 0; i < flakes; i++) {
          const drift = Math.sin(t * 0.0012 + i * 1.7) * 6 + wx * 10
          const sxp = (i * 137 + t * 0.12 + drift) % W
          const syp = (i * 251 + t * 0.25) % H
          const sz = 1 + ((i * 7) % 2)
          ctx.fillRect(sxp, syp, sz, sz)
        }
      } else {
        ctx.strokeStyle = isStorm
          ? `rgba(180,195,230,${0.1 + wi * 0.1})`
          : `rgba(170,190,225,${0.08 + wi * 0.08})`
        ctx.lineWidth = 1
        const streaks = Math.round((isStorm ? 80 : 50) * (0.4 + wi * 0.6))
        const baseSlant = isStorm ? 10 : 6
        const slantX = wx * baseSlant
        const slantY = (1 + wy * 0.5) * 8
        ctx.beginPath()
        for (let i = 0; i < streaks; i++) {
          const sxp = (i * 137 + t * 0.7) % W
          const syp = (i * 251 + t * (isStorm ? 1.4 : 1.0)) % H
          ctx.moveTo(sxp, syp)
          ctx.lineTo(sxp + slantX, syp + slantY)
        }
        ctx.stroke()
      }
    }
  }

  if (world.drought === true) {
    const shimmer = (Math.sin(t * 0.001) * 0.5 + 0.5) * 0.04
    ctx.fillStyle = `rgba(255,180,80,${shimmer})`
    ctx.fillRect(0, 0, W, H)
  }

  if (!world.is_day || (world.day_progress ?? 0) > 0.05) {
    const tt = t * 0.001
    ctx.fillStyle = world.is_day ? 'rgba(255,255,255,0.55)' : 'rgba(180,200,240,0.30)'
    // Align to even boundaries so the star-on-water pattern stays
    // stable as the camera pans (stride-2 sampling must visit the
    // same cells from frame to frame).
    for (let row = r0 & ~1; row < r1; row += 2) {
      for (let col = c0 & ~1; col < c1; col += 2) {
        if (!isPermanentWaterTile(tiles[row]?.[col])) continue
        let h = (col * 374761393 + row * 668265263) | 0
        h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
        const phase = ((h & 0xff) / 255) * Math.PI * 2
        const blink = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
        if (blink < 1.3) continue
        const px = col * TILE + ((h >>> 8) & 3)
        const py = row * TILE + ((h >>> 10) & 3)
        ctx.fillRect(px, py, 2, 1)
      }
    }
  }

  {
    const foamT = t * 0.0014
    const fr0 = Math.max(0, r0)
    const fr1 = Math.min(height, r1)
    const fc0 = Math.max(0, c0)
    const fc1 = Math.min(width, c1)
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.55)'
      for (let row = fr0; row < fr1; row++) {
        for (let col = fc0; col < fc1; col++) {
          const shore = permanentWaterLandEdgeMask(tiles, row, col)
          if (shore === 0) continue
          if (pass === 1) {
            let h = (col * 374761393 + row * 668265263) | 0
            h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
            const pulse = Math.sin(foamT + ((h & 0xff) / 255) * Math.PI * 2)
            if (pulse < 0.25) continue
          }
          const px = col * TILE
          const py = row * TILE
          const th = pass === 1 ? 2 : 1
          if (shore & EDGE_NORTH) ctx.fillRect(px, py, TILE, th)
          if (shore & EDGE_SOUTH) ctx.fillRect(px, py + TILE - th, TILE, th)
          if (shore & EDGE_EAST) ctx.fillRect(px + TILE - th, py, th, TILE)
          if (shore & EDGE_WEST) ctx.fillRect(px, py, th, TILE)
        }
      }
    }
  }

  // Lake shimmer - animated sparkle on shallow water tiles (depth 180-253)
  {
    const dm = world.grid.depth_map
    const shimmerT = t * 0.0015
    ctx.fillStyle = 'rgba(180,230,255,0.28)'
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
        if (d === null || d < 180) continue
        let h = (col * 374761393 + row * 668265263) | 0
        h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
        const pulse = Math.sin(shimmerT * 2.1 + ((h & 0xff) / 255) * Math.PI * 2)
        if (pulse < 0.6) continue
        ctx.fillRect(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
      }
    }

    // Integer-aligned wavelets stay within the camera window instead of
    // scanning and antialiasing paths across the whole world.
    if (!LOW_PERF) {
      ctx.fillStyle = 'rgba(140,200,240,0.2)'
      const wavePhase = Math.floor(shimmerT * 3)
      for (let row = r0; row < r1; row += 2) {
        for (let col = c0; col < c1; col++) {
          const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
          if (d === null || d < 180) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
          if ((h + wavePhase) % 7 !== 0) continue
          const wx = col * TILE + 1 + ((h >>> 8) & 1)
          const wy = row * TILE + 2 + ((wavePhase + (h >>> 10)) & 3)
          ctx.fillRect(wx, wy, 3, 1)
        }
      }
    }
  }

  for (let row = r0; row < r1; row++) {
    for (let col = c0; col < c1; col++) {
      const tile = tiles[row][col]
      if (
        tile !== TILE_ID.FOOD &&
        tile !== TILE_ID.FIRE &&
        tile !== TILE_ID.CAMPFIRE &&
        tile !== TILE_ID.HUT &&
        tile !== TILE_ID.MINERAL
      ) {
        continue
      }
      const px = col * TILE
      const py = row * TILE
      const seed = visualTileHash(col + ox, row + oy)

      if (tile === TILE_ID.FOOD) {
        drawFoodPatch(ctx, px, py, seed)
      }

      if (tile === TILE_ID.MINERAL) {
        drawMineralOutcrop(ctx, px, py, seed)
      }

      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE) {
        const fi = fire_intensity?.[row]?.[col] ?? 1
        const isCampfire = tile === TILE_ID.CAMPFIRE
        if (!world.is_day) {
          const fcx = px + TILE / 2
          const fcy = py + TILE / 2
          const flicker = 0.88 + Math.sin(t * 0.011 + col * 3.1 + row * 1.7) * 0.12
          const lr = TILE * (isCampfire ? 4.2 : 3.2) * flicker
          const grad = ctx.createRadialGradient(fcx, fcy, TILE * 0.4, fcx, fcy, lr)
          grad.addColorStop(0, `rgba(255,190,90,${0.36 * fi})`)
          grad.addColorStop(0.45, `rgba(255,150,50,${0.14 * fi})`)
          grad.addColorStop(1, 'rgba(255,120,30,0)')
          ctx.fillStyle = grad
          ctx.fillRect(fcx - lr, fcy - lr, lr * 2, lr * 2)
        }
        drawPixelFire(ctx, px, py, fi, Math.floor(t / 170 + (seed & 7)), isCampfire)
      }

      if (tile === TILE_ID.HUT && !ruinedTiles.has(`${col + ox},${row + oy}`)) {
        const BW = TILE
        const BH = TILE
        const bx = px
        const by = py
        const dp = world.day_progress ?? 0.5
        const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
        const glowAlpha = 0.04 + 0.18 * nightFactor
        ctx.fillStyle = `rgba(255,215,110,${glowAlpha})`
        ctx.fillRect(bx - TILE / 2, by - TILE / 2, BW + TILE, BH + TILE)
        const hutVariant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
        const hutNight = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
        const hutSprite = getBuildingSprite('Hut', 1, 1, TILE, hutVariant, hutNight, 1)
        if (hutSprite) {
          ctx.drawImage(
            hutSprite,
            Math.round(bx - SPRITE_PAD),
            Math.round(by + BH + SPRITE_PAD_BOT - hutSprite.height),
          )
        }
        const now = Date.now()
        const smokeAlpha = !world.is_day ? 0.25 : 0
        if (smokeAlpha > 0) {
          for (let s = 0; s < 3; s++) {
            const phase = (now * 0.0008 + s * 0.4) % 1
            ctx.fillStyle = `rgba(180,180,185,${smokeAlpha * (1 - phase)})`
            const smokeSize = 1 + Math.floor(phase * 2)
            ctx.fillRect(
              Math.round(bx + BW / 2 + Math.sin(phase * Math.PI) * 2),
              Math.round(by - phase * 10),
              smokeSize + 1,
              smokeSize,
            )
          }
        }
      }
    }
  }

  // Settlement markers: draw a subtle ring around clusters of 3+ huts
  {
    const hutPositions: [number, number][] = []
    for (let row = r0; row < r1; row++) {
      const tr = tiles[row]
      if (!tr) continue
      for (let col = c0; col < c1; col++) {
        if (tr[col] === 8) hutPositions.push([col, row])
      }
    }
    if (hutPositions.length >= 3) {
      const usedInCluster = new Set<number>()
      for (let i = 0; i < hutPositions.length; i++) {
        if (usedInCluster.has(i)) continue
        const [hx, hy] = hutPositions[i]
        const cluster = [i]
        for (let j = i + 1; j < hutPositions.length; j++) {
          const [jx, jy] = hutPositions[j]
          const d2 = (hx - jx) ** 2 + (hy - jy) ** 2
          if (d2 < 64) {
            cluster.push(j)
            usedInCluster.add(j)
          }
        }
        usedInCluster.add(i)
        if (cluster.length < 3) continue
        const cx2 = cluster.reduce((s, k) => s + hutPositions[k][0], 0) / cluster.length
        const cy2 = cluster.reduce((s, k) => s + hutPositions[k][1], 0) / cluster.length
        const r2 = Math.sqrt(cluster.length) * TILE * 2.2 + TILE * 3
        const px2 = cx2 * TILE + TILE / 2
        const py2 = cy2 * TILE + TILE / 2
        ctx.save()
        // Settlement ring
        ctx.strokeStyle = `rgba(200,170,80,${Math.min(0.45, 0.2 + cluster.length * 0.04)})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(px2, py2, r2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        // Town hall icon for large settlements (5+ huts)
        if (cluster.length >= 5) {
          const TH = TILE * 3.5 // town hall icon size
          const tx = px2 - TH / 2
          const ty = py2 - TH / 2
          // Glow
          ctx.fillStyle = 'rgba(255,220,130,0.22)'
          ctx.fillRect(tx - TILE, ty - TILE, TH + TILE * 2, TH + TILE * 2)
          // Main body
          ctx.fillStyle = '#d4b87a'
          ctx.fillRect(tx + 2, ty + TH * 0.36, TH - 4, TH * 0.64 - 1)
          // Main roof
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty)
          ctx.lineTo(tx + TH, ty + TH * 0.38)
          ctx.lineTo(tx, ty + TH * 0.38)
          ctx.closePath()
          ctx.fill()
          // Central tower
          const tw = TH * 0.22
          const th2 = TH * 0.85
          ctx.fillStyle = '#c0a870'
          ctx.fillRect(px2 - tw / 2, ty - th2 * 0.2, tw, th2 * 0.65)
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty - th2 * 0.28)
          ctx.lineTo(px2 + tw / 2 + 1, ty - th2 * 0.2)
          ctx.lineTo(px2 - tw / 2 - 1, ty - th2 * 0.2)
          ctx.closePath()
          ctx.fill()
          // Door
          ctx.fillStyle = '#2a1000'
          ctx.fillRect(px2 - TH * 0.06, ty + TH * 0.55, TH * 0.12, TH * 0.45 - 1)
          // Windows
          ctx.fillStyle = 'rgba(255,235,150,0.65)'
          ctx.fillRect(tx + 4, ty + TH * 0.42, 4, 4)
          ctx.fillRect(tx + TH - 8, ty + TH * 0.42, 4, 4)
        }
        ctx.restore()
      }
    }
  }

  if (structure) {
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          if (s >= 0.7) {
            ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
            ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
            ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
            ctx.beginPath()
            ctx.moveTo(cx2, py + 2)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.52)
            ctx.lineTo(px + 2, py + TILE * 0.52)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = 'rgba(160,140,110,0.5)'
            ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
            ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
          } else if (s >= 0.35) {
            ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
            ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
            ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
            ctx.beginPath()
            ctx.moveTo(cx2 - 1, py + 3)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
            ctx.lineTo(px + 2, py + TILE * 0.47)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
            ctx.fillRect(px + 1, py + TILE * 0.6, TILE - 2, TILE * 0.35)
          }
        } else {
          const r = s >= 0.7 ? 120 : s >= 0.35 ? 100 : 130
          const g = s >= 0.7 ? 90 : s >= 0.35 ? 65 : 95
          const b = s >= 0.7 ? 60 : s >= 0.35 ? 30 : 45
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  if (overlay === 'hazard' && world.grid.hazard) {
    const haz = world.grid.hazard
    for (let row = r0; row < r1; row++) {
      const r = haz[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(220,40,30,${Math.min(0.75, v * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'fertility' && world.grid.fertility) {
    const fer = world.grid.fertility
    for (let row = r0; row < r1; row++) {
      const r = fer[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.1) continue
        ctx.fillStyle = `rgba(80,200,80,${Math.min(0.55, v * 0.6)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'structures' && world.grid.structure) {
    const str = world.grid.structure
    for (let row = r0; row < r1; row++) {
      const r = str[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(255,170,60,${Math.min(0.7, v * 0.8)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'trails') {
    const ft = world.grid.food_trail
    const wt = world.grid.water_trail
    const pt = world.grid.path_trail
    for (let row = r0; row < r1; row++) {
      const fr = ft?.[row]
      const wr = wt?.[row]
      const pr = pt?.[row]
      for (let col = c0; col < c1; col++) {
        const f = fr?.[col] ?? 0
        const w = wr?.[col] ?? 0
        const p = pr?.[col] ?? 0
        if (f < 0.05 && w < 0.05 && p < 0.05) continue
        const r = Math.round(255 * f + 70 * w + 40 * p)
        const g = Math.round(200 * f + 130 * w + 200 * p)
        const b = Math.round(40 * f + 220 * w + 70 * p)
        const a = Math.min(0.65, (f + w + p) * 0.5)
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'age') {
    const n = height * width
    const sum = scratchA(n)
    const cnt = scratchB(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const idx = ny * width + nx
          sum[idx] += org.age
          cnt[idx] += 1
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const idx = rowBase + col
        const c = cnt[idx]
        if (c === 0) continue
        const t = Math.min(1, sum[idx] / c / 3000)
        const r = Math.round(80 + t * 175)
        const g = Math.round(220 - t * 140)
        const b = Math.round(180 - t * 160)
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'threat') {
    const n = height * width
    const heat = scratchA(n)
    for (const org of organisms) {
      if (!org.alive || (org.fear_level ?? 0) < 0.3) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      const R = 3
      const f = org.fear_level ?? 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          heat[ny * width + nx] += (f * (R - d + 1)) / (R + 1)
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = heat[rowBase + col]
        if (v < 0.15) continue
        const t = Math.min(1, v / 2)
        ctx.fillStyle = `rgba(255,${Math.round(140 - t * 100)},${Math.round(60 - t * 40)},${(0.3 + t * 0.4).toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'density') {
    const n = height * width
    const grid2d = scratchA(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx2 = Math.round(org.x - ox),
        ty2 = Math.round(org.y - oy)
      const R = 4
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx2 + dx,
            ny = ty2 + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) {
            grid2d[ny * width + nx] += R - d + 1
          }
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < n; k++) if (grid2d[k] > maxD) maxD = grid2d[k]
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = grid2d[rowBase + col]
        if (v < 1) continue
        const t2 = Math.min(v / maxD, 1)
        ctx.fillStyle = `rgba(${Math.round(80 + t2 * 175)},${Math.round(200 - t2 * 100)},${Math.round(255 - t2 * 200)},${0.25 + t2 * 0.45})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (viewFlags.territory && world.territory) {
    const index = buildTerritoryIndex(world.territory)
    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null

    for (const claim of world.territory.claimed) {
      const standing = territoryStanding(claim.lid, focusedLineage, world.tribal_relations)
      const emphasis = territoryEmphasis(standing)
      const color = lineageColor(claim.lid)
      const fill = color.replace('hsl(', 'hsla(').replace(')', `, ${emphasis.fillAlpha})`)
      const border =
        emphasis.borderColor ??
        color
          .replace(/(\d+)%\)$/, (_, lightness) => `${Math.max(15, Number(lightness) - 24)}%, 0.9)`)
          .replace('hsl(', 'hsla(')

      ctx.beginPath()
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = fill
      ctx.fill()

      ctx.beginPath()
      const owns = (x: number, y: number) =>
        index.ownersByTile.get(territoryTileKey(x, y))?.includes(claim.lid) === true
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        const px = col * TILE
        const py = row * TILE
        if (!owns(worldTileX, worldTileY - 1)) {
          ctx.moveTo(px, py)
          ctx.lineTo(px + TILE, py)
        }
        if (!owns(worldTileX + 1, worldTileY)) {
          ctx.moveTo(px + TILE, py)
          ctx.lineTo(px + TILE, py + TILE)
        }
        if (!owns(worldTileX, worldTileY + 1)) {
          ctx.moveTo(px + TILE, py + TILE)
          ctx.lineTo(px, py + TILE)
        }
        if (!owns(worldTileX - 1, worldTileY)) {
          ctx.moveTo(px, py + TILE)
          ctx.lineTo(px, py)
        }
      }
      ctx.strokeStyle = border
      ctx.lineWidth = emphasis.borderWidth
      ctx.stroke()
    }

    if (world.territory.contested.length > 0) {
      const pulse = 0.12 + Math.abs(Math.sin(t / 420)) * 0.16
      ctx.beginPath()
      for (const [worldTileX, worldTileY] of world.territory.contested) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.fill()
    }
  }

  drawClouds(ctx, W, H, world.weather, t)

  if (viewFlags.history && world.lineage_centroid_history) {
    ctx.save()
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [lid, samples] of Object.entries(world.lineage_centroid_history)) {
      if (!samples || samples.length < 2) continue
      const hsl = lineageColor(lid)
      for (let i = 1; i < samples.length; i++) {
        const [, x0, y0] = samples[i - 1]
        const [, x1, y1] = samples[i]
        const a = 0.15 + 0.7 * (i / samples.length)
        ctx.strokeStyle = hsl.replace('hsl(', 'hsla(').replace(')', `, ${a.toFixed(2)})`)
        ctx.beginPath()
        ctx.moveTo((x0 - ox) * TILE + TILE / 2, (y0 - oy) * TILE + TILE / 2)
        ctx.lineTo((x1 - ox) * TILE + TILE / 2, (y1 - oy) * TILE + TILE / 2)
        ctx.stroke()
      }
      const [, lx, ly] = samples[samples.length - 1]
      ctx.fillStyle = hsl.replace('hsl(', 'hsla(').replace(')', ', 0.95)')
      ctx.beginPath()
      ctx.arc((lx - ox) * TILE + TILE / 2, (ly - oy) * TILE + TILE / 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  if (viewFlags.fertility && fertility) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = fertility[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const f = r[col]
        if (f == null) continue
        if (f > 0.55) {
          ctx.fillStyle = `rgba(80,180,80,${Math.min(0.45, (f - 0.55) * 1.2)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        } else if (f < 0.25) {
          ctx.fillStyle = `rgba(150,90,50,${Math.min(0.45, (0.25 - f) * 1.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.hazard && hazard) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = hazard[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const h = r[col]
        if (h == null || h < 0.02) continue
        ctx.fillStyle = `rgba(200,40,40,${Math.min(0.55, h * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  // Always show high-traffic paths subtly (helps map feel lived-in)
  if (path_trail) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const pr = path_trail[row]
      if (!pr) continue
      for (let col = c0; col < c1; col++) {
        const p = pr[col] ?? 0
        if (p < 0.55) continue
        ctx.fillStyle = `rgba(160,130,80,${Math.min(0.28, p * 0.3)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  if (viewFlags.trails && (food_trail || water_trail || path_trail)) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const f = food_trail?.[row]?.[col] ?? 0
        const w = water_trail?.[row]?.[col] ?? 0
        const p = path_trail?.[row]?.[col] ?? 0
        if (f < 0.1 && w < 0.1 && p < 0.1) continue
        if (p >= 0.1) {
          ctx.fillStyle = `rgba(220,220,220,${Math.min(0.35, p * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (f >= 0.1) {
          ctx.fillStyle = `rgba(240,220,80,${Math.min(0.4, f * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (w >= 0.1) {
          ctx.fillStyle = `rgba(100,170,240,${Math.min(0.4, w * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.structures && structure) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,210,140,0.7)'
    ctx.lineWidth = 1
    for (let row = r0; row < r1; row++) {
      const r = structure[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        if (r[col] && r[col] > 0.1) {
          ctx.strokeRect(col * TILE + 0.5, row * TILE + 0.5, TILE - 1, TILE - 1)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.partners) {
    // Pre-filter to partnered orgs before building the lookup map.
    // Most orgs are unpartnered; building a full byId map of all
    // organisms is wasted work each frame.
    const partnered: WorldState['organisms'] = []
    for (const o of organisms) {
      if (o.alive && o.partner_id) partnered.push(o)
    }
    if (partnered.length >= 2) {
      const byId = new Map<string, (typeof partnered)[number]>()
      for (const o of partnered) byId.set(o.id, o)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,170,200,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const org of partnered) {
        if (!org.partner_id) continue
        if (org.id >= org.partner_id) continue
        const partner = byId.get(org.partner_id)
        if (!partner) continue
        const ax = (org.x - ox) * TILE + TILE / 2
        const ay = (org.y - oy) * TILE + TILE / 2
        const bx = (partner.x - ox) * TILE + TILE / 2
        const by = (partner.y - oy) * TILE + TILE / 2
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
      }
      // Single stroke() at the end instead of per-edge - cuts state-
      // change overhead when there are many partnered pairs.
      ctx.stroke()
      ctx.restore()
    }
  }

  if (world.farms && world.farms.length > 0) {
    ctx.save()
    for (const farm of world.farms) {
      const localX = farm.x - ox
      const localY = farm.y - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      const x = localX * TILE
      const y = localY * TILE
      const progress = farmProgress(farm, world.tick)
      const stage = farmStage(farm, world.tick)
      const cropColor = farmCropColor(farm.crop)

      ctx.fillStyle = '#3f2c21'
      ctx.fillRect(x, y, TILE, TILE)
      ctx.fillStyle = stage === 'fallow' ? '#6b4c32' : '#705335'
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
      ctx.fillStyle = stage === 'mature' ? '#b98b45' : '#4a3326'
      for (let row = 2; row < TILE - 1; row += 3) {
        ctx.fillRect(x + 1, y + row, TILE - 2, 1)
      }
      if (stage !== 'fallow') {
        ctx.fillStyle = cropColor
        const plantHeight = Math.max(1, Math.round(1 + progress * 4))
        const cropOffset = (farm.crop?.length ?? 0) % 2
        for (let plantX = 2 + cropOffset; plantX < TILE - 1; plantX += 3) {
          ctx.fillRect(x + plantX, y + TILE - plantHeight - 1, 1, plantHeight)
          if (plantHeight >= 3) ctx.fillRect(x + plantX + 1, y + TILE - plantHeight, 1, 1)
        }
      }
      if (stage === 'mature') {
        ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
        ctx.fillRect(x, y, TILE, 1)
        ctx.fillRect(x, y + TILE - 1, TILE, 1)
        ctx.fillRect(x, y, 1, TILE)
        ctx.fillRect(x + TILE - 1, y, 1, TILE)
      }
    }
    ctx.restore()
  }

  if (world.buildings && world.buildings.length > 0) {
    // Viewport-clip the building loop. Buildings are world-positioned;
    // c0/r0/c1/r1 are the tile-aligned visible window already computed
    // by the camera step. A generous 6-tile margin covers the tallest
    // building footprints without false-negative culling.
    const BLDG_MARGIN = 6
    const cxLo = c0 - BLDG_MARGIN
    const cxHi = c1 + BLDG_MARGIN
    const ryLo = r0 - BLDG_MARGIN
    const ryHi = r1 + BLDG_MARGIN
    const bdp = world.day_progress ?? 0.5
    const bNight = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(bdp - 0.5) * 2))
    const buildingDetail = zoomDetailLevel(cameraZoom)
    const sorted = [...world.buildings].sort(compareBuildingsByDepth)
    for (const b of sorted) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      if (b.x < cxLo || b.x > cxHi || b.y < ryLo || b.y > ryHi) continue
      drawBuilding(
        ctx,
        {
          id: b.id,
          kind: b.kind,
          x: b.x,
          y: b.y,
          condition: b.condition,
          damage: b.damage,
          integrity: b.integrity,
          ruined: b.ruined,
          repairing: b.repairing,
          footprint: b.footprint,
          fw: b.fw,
          fh: b.fh,
        },
        ox,
        oy,
        TILE,
        bNight,
        buildingDetail,
      )
    }
    type Cluster = {
      cx: number
      cy: number
      count: number
      lineage: string
      name?: string
      tier?: number
      tierName?: string
      population?: number
    }
    const clusters: Cluster[] = []
    const CITY_RADIUS_SQ = 14 * 14
    if (world.settlements?.length) {
      for (const settlement of world.settlements) {
        const [cx, cy] = settlement.center
        if (cx < cxLo || cx > cxHi || cy < ryLo || cy > ryHi) continue
        clusters.push({
          cx,
          cy,
          count: settlement.building_count,
          lineage: settlement.lineage_id,
          name: settlement.name,
          tier: settlement.tier,
          tierName: settlement.tier_name,
          population: settlement.population,
        })
      }
    } else {
      // Legacy snapshots lack authoritative settlements. Retain the old
      // visual clustering as a compatibility fallback only.
      for (const b of world.buildings) {
        if (!getBuildingState(b).isOperational) continue
        const lid = (b as { lineage_id?: string }).lineage_id ?? ''
        if (!lid) continue
        const bx = b.x
        const by = b.y
        if (bx < cxLo || bx > cxHi || by < ryLo || by > ryHi) continue
        const existing = clusters.find(
          (c) => c.lineage === lid && (c.cx - bx) ** 2 + (c.cy - by) ** 2 < CITY_RADIUS_SQ,
        )
        if (existing) {
          existing.cx = (existing.cx * existing.count + bx) / (existing.count + 1)
          existing.cy = (existing.cy * existing.count + by) / (existing.count + 1)
          existing.count++
        } else {
          clusters.push({ cx: bx, cy: by, count: 1, lineage: lid })
        }
      }
    }
    const lineageNames = world.lineage_names ?? {}
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const c of clusters) {
      const major = (c.tier ?? (c.count >= 12 ? 5 : 0)) >= 5
      const showSettlementLabel =
        c.tier !== 0 && !(c.tier === undefined && c.count < 4) && (buildingDetail !== 'overview' || major)
      if (!showSettlementLabel) continue
      const name = c.name ?? lineageNames[c.lineage] ?? c.lineage.slice(0, 6)
      const label =
        c.tier !== undefined
          ? c.tier >= 5
            ? `${name.toUpperCase()} CITY`
            : `${name} ${c.tierName ?? 'settlement'}`
          : c.count >= 12
            ? `${name.toUpperCase()} CITY`
            : c.count >= 8
              ? `${name} town`
              : `${name} village`
      const lx = (c.cx - ox) * TILE
      const ly = (c.cy - oy) * TILE - TILE * 2
      ctx.font = major ? 'bold 12px monospace' : '10px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillText(label, lx + 1, ly + 1)
      ctx.fillStyle = major ? '#ffd28a' : (c.tier ?? 0) >= 4 || c.count >= 8 ? '#e5c89a' : '#c8b890'
      ctx.fillText(label, lx, ly)
      ctx.font = '8px monospace'
      ctx.fillStyle = '#8a8170'
      ctx.fillText(
        c.population !== undefined ? `${c.population} people · ${c.count} buildings` : `${c.count} bldgs`,
        lx,
        ly + 10,
      )
    }
    ctx.restore()
  }

  drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t)

  if (viewFlags.animals && animals.length > 0) {
    ctx.save()
    const atlasReady = ATLAS_CREATURE.complete && ATLAS_CREATURE.naturalWidth > 0
    if (_animalLastPos.size > Math.max(256, animals.length * 3)) {
      const visibleIds = new Set(animals.map((animal) => animal.id))
      for (const id of _animalLastPos.keys()) {
        if (!visibleIds.has(id)) _animalLastPos.delete(id)
      }
    }
    for (const animal of animals) {
      const small = animal.kind === 'fish' || animal.kind === 'bird' || animal.kind === 'rabbit'
      const size = small ? 11 : 14
      const moving =
        animal.kind === 'fish' || animal.kind === 'bird' || animalIsMoving(animal.id, animal.x, animal.y, t)
      const speed =
        animal.kind === 'fish'
          ? 0.0028
          : animal.kind === 'bird'
            ? 0.005
            : animal.kind === 'wolf' || animal.kind === 'dog'
              ? 0.0042
              : 0.0036
      const amp = animal.kind === 'fish' ? 1.4 : animal.kind === 'bird' ? 1.6 : moving ? 0.55 : 0
      const phase = t * speed + animal.id * 0.7
      const yOff = Math.sin(phase) * amp
      const cx = (animal.x - ox) * TILE + TILE / 2
      const cy = (animal.y - oy) * TILE + TILE / 2 + yOff
      if (animal.kind !== 'fish' && animal.kind !== 'bird') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + size * 0.42, size * 0.32, size * 0.14, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      const flip = (((animal.id * 2654435761) >>> 0) & 1) === 1
      if (animal.kind === 'wolf' || animal.kind === 'dog') {
        drawCanineSprite(
          ctx,
          cx,
          cy,
          size,
          animal.kind,
          flip,
          moving ? Math.floor(t / 220 + animal.id) & 1 : 0,
        )
      } else if (atlasReady) {
        // Tiny Creatures is a catalogue, not an animation strip. Keep each
        // animal on one deterministic variant so deer never morph into boar.
        const tile = pickAnimalTile(animal.kind, animal.id)
        const dx = Math.round(cx - size / 2)
        const dy = Math.round(cy - size / 2)
        if (!tile) {
          continue
        } else if (flip) {
          ctx.save()
          ctx.translate(dx + size, 0)
          ctx.scale(-1, 1)
          drawTile(ctx, ATLAS_CREATURE, tile, 0, dy, size)
          ctx.restore()
        } else {
          drawTile(ctx, ATLAS_CREATURE, tile, dx, dy, size)
        }
      } else {
        ctx.fillStyle = animal.kind === 'fish' ? '#6f9fb0' : '#8a6a4a'
        ctx.beginPath()
        ctx.ellipse(cx, cy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  const lineageErasMap = normalizeLineageEras(world.lineage_eras)

  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
    if (focus === 'sick') return org.infection > 0.15
    if (focus === 'hungry') return org.energy < 0.3
    if (focus === 'elders') return !!org.is_elder
    if (focus === 'builders')
      return !!(org.discoveries ?? []).some((d) =>
        ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
      )
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  if (_orgLastPos.size > Math.max(512, organisms.length * 3)) {
    const visibleIds = new Set(organisms.map((organism) => organism.id))
    for (const id of _orgLastPos.keys()) {
      if (!visibleIds.has(id)) _orgLastPos.delete(id)
    }
  }

  const characterDetail = zoomDetailLevel(cameraZoom)
  for (const org of organisms) {
    if (!org.alive) continue
    // Data-driven house entry: use actual sleep_debt, energy, health fields - no text matching
    if (org.home_x && org.home_y) {
      const ddx = org.x - org.home_x
      const ddy = org.y - org.home_y
      if (ddx * ddx + ddy * ddy < 2.0) {
        if ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15) continue
      }
    }
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    const isSelected = org.id === selectedOrgId
    const fullDetail = isSelected || characterDetail === 'detail'
    const standardDetail = isSelected || characterDetail !== 'overview'
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const orgSex: 'male' | 'female' = org.sex === 'female' ? 'female' : 'male'
    const stage = resolveAgeStage(org)
    // The atlas owns age-specific proportions. Keeping one destination box
    // prevents infants and children from being scaled down twice.
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    ctx.globalAlpha = focused ? 1 : 0.12

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(px + 1, py + spriteSize * 0.2, spriteSize * 0.27, spriteSize * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()

    const isSignaling = org.thought.startsWith('"') || org.thought.startsWith("'")
    if (standardDetail && (isSignaling || org.thought === 'sounding alarm')) {
      ctx.strokeStyle =
        org.thought.includes('!') || org.thought === 'sounding alarm'
          ? 'rgba(255,68,136,0.6)'
          : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
    } else if (standardDetail && (org.thought === 'challenging' || org.thought === 'challenging alone')) {
      ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py - 11)
      ctx.lineTo(px + 11, py)
      ctx.lineTo(px, py + 11)
      ctx.lineTo(px - 11, py)
      ctx.closePath()
      ctx.stroke()
    }

    if (standardDetail && org.infection > 0.15) {
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath()
      ctx.ellipse(px, py + 2, spriteSize * 0.42, spriteSize * 0.24, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (standardDetail && org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 0.75 + org.traits.resilience : 1
      ctx.beginPath()
      ctx.ellipse(px, py + 3, spriteSize * 0.34, spriteSize * 0.17, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Keep simulation state visible as a restrained aura, not an opaque shape
    // painted over the character art.
    let bodyFill: string
    if (org.infection > 0.38) bodyFill = 'hsl(85,60%,48%)'
    else if ((org.fear_level ?? 0) > 0.72) bodyFill = 'hsl(10,70%,48%)'
    else if ((org.grief_ticks ?? 0) > 12) bodyFill = 'hsl(220,50%,50%)'
    else if ((org.joy_ticks ?? 0) > 30) bodyFill = 'hsl(45,80%,62%)'
    else if (org.energy < 0.12) bodyFill = 'hsl(38,55%,38%)'
    else bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'

    if (viewFlags.health) {
      const h = Math.max(0, Math.min(1, org.health))
      const r = Math.round(220 * (1 - h) + 80 * h)
      const g = Math.round(80 * (1 - h) + 200 * h)
      const b = Math.round(80 * (1 - h) + 100 * h)
      bodyFill = `rgb(${r},${g},${b})`
    } else if (viewFlags.age) {
      if (stage === 'elder') bodyFill = '#e9c87a'
      else if (stage === 'infant' || stage === 'child') bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    ctx.save()
    ctx.globalAlpha *= viewFlags.health || viewFlags.age ? 0.3 : standardDetail ? 0.16 : 0.1
    ctx.fillStyle = bodyFill
    ctx.beginPath()
    ctx.arc(px, py, bodyR + 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    if (standardDetail && viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (standardDetail && viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath()
      ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (standardDetail && viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const frame = orgFrame(org.id, org.x, org.y, t)
    const drew = drawPeopleTile(
      ctx,
      pickHumanSprite(orgSex, stage, frame, deterministicAppearanceIndex(org.id)),
      Math.round(px - spriteSize / 2),
      Math.round(spriteTop),
      spriteSize,
    )
    if (!drew) {
      ctx.fillStyle = variant.hairColor
      ctx.beginPath()
      ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = variant.accent
      ctx.fillRect(Math.round(px - bodyR * 0.7), Math.round(py + bodyR * 0.15), bodyR * 1.4, 2)
    }

    const era = lineageErasMap[org.lineage_id] ?? ''
    if (standardDetail && era && era !== 'pre-stone' && era !== 'stone') {
      ctx.save()
      ctx.fillStyle = ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0.0)'
      ctx.globalAlpha *= 0.75
      ctx.fillRect(Math.round(px - bodyR), Math.round(py + bodyR + 1), Math.round(bodyR * 2), 1)
      ctx.restore()
    }
    if (org.is_leader) {
      const crownX = Math.round(px - 4)
      const crownY = Math.round(spriteTop - 2)
      ctx.fillStyle = '#f2c84b'
      ctx.fillRect(crownX, crownY, 8, 2)
      ctx.fillRect(crownX, crownY - 2, 2, 2)
      ctx.fillRect(crownX + 3, crownY - 3, 2, 3)
      ctx.fillRect(crownX + 6, crownY - 2, 2, 2)
    }
    const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
    if (fullDetail && specEmoji) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(specEmoji, px + bodyR + 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (standardDetail && org.diseases && org.diseases.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F912}', px - bodyR - 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (fullDetail && org.tools) {
      const toolEmoji = pickToolEmoji(org.tools)
      if (toolEmoji) {
        ctx.save()
        ctx.font = '8px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(toolEmoji, px + bodyR + 4, py + bodyR * 0.6)
        ctx.restore()
      }
    }
    if (fullDetail && org.degrees && org.degrees.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F393}', px - bodyR - 4, py + bodyR * 0.6)
      ctx.restore()
    }

    if (standardDetail && org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(Math.round(px + spriteSize * 0.2), Math.round(py - 1), 5, 4)
    }

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    if (showVitals) {
      const barW = Math.max(8, Math.round(spriteSize * 0.55))
      const bx = Math.round(px - barW / 2)
      const by = Math.round(spriteTop - 5)
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(bx - 1, by - 1, barW + 2, 6)
      ctx.fillStyle = '#55dd55'
      ctx.fillRect(bx, by, Math.round(barW * Math.max(0, Math.min(1, org.energy))), 1)
      ctx.fillStyle = '#4499ff'
      ctx.fillRect(bx, by + 2, Math.round(barW * Math.max(0, Math.min(1, org.hydration))), 1)
      ctx.fillStyle = '#ff665c'
      ctx.fillRect(bx, by + 4, Math.round(barW * Math.max(0, Math.min(1, org.health))), 1)
    }

    const showName = isSelected || (standardDetail && viewFlags.names)
    const showThought =
      (isSelected || (fullDetail && viewFlags.thoughts)) && org.thought && org.thought !== 'observing'
    const labelY = spriteTop - (showVitals ? 10 : 2)

    if (showName) {
      ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.name, px, labelY)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
      ctx.fillText(org.name, px, labelY)
    }

    if (showThought) {
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      const thoughtY = labelY - (showName ? 10 : 0)
      ctx.strokeText(org.thought, px, thoughtY)
      ctx.fillStyle = isSelected ? 'rgba(180,220,255,1)' : 'rgba(180,220,255,0.9)'
      ctx.fillText(org.thought, px, thoughtY)
    }
  }
  ctx.globalAlpha = 1

  // Player strategy beacons are a HUD overlay, so draw them after all
  // organisms and buildings. Otherwise a busy settlement can bury the
  // guidance label under hundreds of sprites.
  if (world.lineage_strategies) {
    const settlementsByLineage = new Map(
      (world.settlements ?? []).map((settlement) => [settlement.lineage_id, settlement]),
    )
    for (const [lineage, entry] of Object.entries(world.lineage_strategies)) {
      const strategy = activeStrategy(entry, world.tick)
      if (!strategy) continue
      const settlement = settlementsByLineage.get(lineage)
      const home = world.lineage_homes?.[lineage]
      const members = organisms.filter((organism) => organism.alive && organism.lineage_id === lineage)
      if (!settlement && !home && members.length === 0) continue
      const wx =
        settlement?.center[0] ??
        home?.[0] ??
        members.reduce((sum, organism) => sum + organism.x, 0) / members.length
      const wy =
        settlement?.center[1] ??
        home?.[1] ??
        members.reduce((sum, organism) => sum + organism.y, 0) / members.length
      const centerX = (wx - ox) * TILE + TILE / 2
      const centerY = (wy - oy) * TILE + TILE / 2
      if (centerX < -32 || centerX > W + 32 || centerY < -32 || centerY > H + 32) continue

      const pulse = 22 + Math.sin(t * 0.003 + wx * 0.11 + wy * 0.07) * 4
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse + 7, 0, Math.PI * 2)
      ctx.stroke()

      const label = `${strategy.symbol} ${strategy.label} · ${strategyTimeLabel(strategy.ticksRemaining)}`
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelWidth = ctx.measureText(label).width + 12
      const labelY = centerY - pulse - 12
      ctx.globalAlpha = 0.92
      ctx.fillStyle = '#11181c'
      ctx.fillRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.globalAlpha = 1
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 1
      ctx.strokeRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.fillStyle = strategy.color
      ctx.fillText(label, centerX, labelY + 0.5)
      ctx.restore()
    }
  }

  if (viewFlags.fps) {
    fpsSamples.push(t)
    if (fpsSamples.length > 60) fpsSamples.shift()
    let fps = 0
    if (fpsSamples.length >= 2) {
      const span = fpsSamples[fpsSamples.length - 1] - fpsSamples[0]
      if (span > 0) fps = ((fpsSamples.length - 1) * 1000) / span
    }
    const text = `${fps.toFixed(0)} fps · ${organisms.filter((o) => o.alive).length} org`
    ctx.save()
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'right'
    const padX = 6
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(W - tw - padX * 2 - 4, 4, tw + padX * 2, 16)
    ctx.fillStyle = '#aaffdd'
    ctx.fillText(text, W - padX - 4, 16)
    ctx.restore()
  }

  if (viewFlags.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * TILE, 0)
      ctx.lineTo(x * TILE, H)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * TILE)
      ctx.lineTo(W, y * TILE)
      ctx.stroke()
    }
  }
}

function WorldSprite({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
  rendererPaused,
  onFirstDraw,
  atX,
  atY,
  cameraStateRef,
  viewportDims,
}: {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  onFirstDraw: () => void
  atX: number
  atY: number
  cameraStateRef?: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims?: { w: number; h: number }
}) {
  useEntity()

  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const dyn = useDynamicCanvas(W, H)

  const hasDrawn = useRef(false)
  const cachedDepth = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const filledOnce = useRef(false)
  const orgInterpCache = useRef<OrgInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const animalInterpCache = useRef<AnimalInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })

  useLayoutEffect(() => {
    if (filledOnce.current) return
    dyn.ctx.fillStyle = '#1a4a80'
    dyn.ctx.fillRect(0, 0, W, H)
    dyn.markDirty()
    filledOnce.current = true
  }, [dyn, W, H])

  const worldRef = useRef<WorldState | null>(world)
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId)
  const overlayRef = useRef<string | null>(overlay)
  const focusRef = useRef<string>(focus)
  const viewFlagsRef = useRef<ViewFlags>(viewFlags)
  worldRef.current = world
  selectedOrgIdRef.current = selectedOrgId
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags

  useEffect(() => {
    if (!interp || rendererPaused) return
    let raf = 0
    let stopped = false
    let lastDrawnAt: number = 0
    let lastDrawnT: number = -1
    let lastDrawnUI: string = ''
    let lowPerfFrameSkip = 0

    const tick = () => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      if (LOW_PERF) {
        lowPerfFrameSkip = (lowPerfFrameSkip + 1) % 2
        if (lowPerfFrameSkip === 1) return
      }

      const w = worldRef.current
      if (!w) return

      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]

      const cur = interp.current.current
      const prev = interp.prev.current
      const curServerAt = interp.currentServerAt.current
      const prevServerAt = interp.prevServerAt.current
      const currentReceivedAt = interp.currentReceivedAt.current
      const slowMo = viewFlagsRef.current.slowMo
      const fastMo = viewFlagsRef.current.fastMo
      const speedDiv = slowMo ? 0.5 : fastMo ? 2.0 : 1.0
      const interval = Math.max(50, curServerAt - prevServerAt) / speedDiv
      const RENDER_LAG_MS = Math.min(120, interval * 0.5)
      const PREDICT_CAP = 2.0
      const t =
        cur && prev && interval > 0
          ? Math.max(
              0,
              Math.min(PREDICT_CAP, (performance.now() - currentReceivedAt - RENDER_LAG_MS) / interval),
            )
          : 1

      const renderZoom = cameraStateRef?.current.zoom ?? 1
      const detailBucket = zoomDetailLevel(renderZoom)
      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${viewFlagsRef.current.territory ? 't' : ''}${viewFlagsRef.current.names ? 'n' : ''}${viewFlagsRef.current.thoughts ? 'h' : ''}${viewFlagsRef.current.animals ? 'a' : ''}${viewFlagsRef.current.grid ? 'g' : ''}|${detailBucket}`
      const settled =
        t >= PREDICT_CAP && lastDrawnT >= PREDICT_CAP && curServerAt === lastDrawnAt && uiKey === lastDrawnUI
      if (settled) return

      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && cur === w) {
        const prevOrgs = prev.viewport_organisms ?? prev.organisms
        const cache = orgInterpCache.current
        if (cache.prevSource !== prevOrgs) {
          cache.prevSource = prevOrgs
          cache.prevById.clear()
          for (const o of prevOrgs) cache.prevById.set(o.id, o)
        }
        if (cache.source !== renderOrgs || cache.frameId !== w.frame_id) {
          cache.source = renderOrgs
          cache.frameId = w.frame_id
          cache.items = renderOrgs.map((o) => ({ ...o }))
        }
        const items = cache.items
        for (let i = 0; i < renderOrgs.length; i++) {
          const o = renderOrgs[i]
          const out = items[i]
          const p = cache.prevById.get(o.id)
          if (p && p.alive && o.alive) {
            out.x = p.x + (o.x - p.x) * t
            out.y = p.y + (o.y - p.y) * t
          } else {
            out.x = o.x
            out.y = o.y
          }
        }
        renderOrgs = items
      }
      let renderAnimals = w.viewport_animals ?? w.animals
      if (prev && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const cache = animalInterpCache.current
        if (cache.prevSource !== prevAnimals) {
          cache.prevSource = prevAnimals
          cache.prevById.clear()
          for (const a of prevAnimals) cache.prevById.set(a.id, a)
        }
        if (cache.source !== renderAnimals || cache.frameId !== w.frame_id) {
          cache.source = renderAnimals
          cache.frameId = w.frame_id
          cache.items = renderAnimals.map((a) => ({ ...a }))
        }
        const items = cache.items
        for (let i = 0; i < renderAnimals.length; i++) {
          const a = renderAnimals[i]
          const out = items[i]
          const p = cache.prevById.get(a.id)
          if (p) {
            out.x = p.x + (a.x - p.x) * t
            out.y = p.y + (a.y - p.y) * t
          } else {
            out.x = a.x
            out.y = a.y
          }
        }
        renderAnimals = items
      }

      const lerpCycle = (a: number, b: number, k: number) => {
        let diff = b - a
        if (diff > 0.5) diff -= 1
        if (diff < -0.5) diff += 1
        const out = a + diff * k
        return ((out % 1) + 1) % 1
      }
      const lerpedDay = prev ? lerpCycle(prev.day_progress, w.day_progress, t) : w.day_progress
      const lerpedSeason = prev ? lerpCycle(prev.season_progress, w.season_progress, t) : w.season_progress

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current ?? w.grid.depth_map,
        biomes: cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid: enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals: renderAnimals,
        day_progress: lerpedDay,
        season_progress: lerpedSeason,
      }

      // Compute the visible-tile window so per-tile overlay loops can
      // skip rows/cols off-screen. We give a 4-tile margin so panning
      // doesn't reveal blank borders before the next frame redraws.
      let bounds: { c0: number; c1: number; r0: number; r1: number } | undefined
      if (cameraStateRef && viewportDims && viewportDims.w > 0 && viewportDims.h > 0) {
        const cam = cameraStateRef.current
        const zoom = renderZoom > 0 ? renderZoom : 1
        const halfW = viewportDims.w / (2 * zoom)
        const halfH = viewportDims.h / (2 * zoom)
        const MARGIN = 4
        const wG = w.grid.width
        const hG = w.grid.height
        const c0 = Math.max(0, Math.floor((cam.x - halfW) / TILE) - MARGIN)
        const c1 = Math.min(wG, Math.ceil((cam.x + halfW) / TILE) + MARGIN)
        const r0 = Math.max(0, Math.floor((cam.y - halfH) / TILE) - MARGIN)
        const r1 = Math.min(hG, Math.ceil((cam.y + halfH) / TILE) + MARGIN)
        if (c1 > c0 && r1 > r0) bounds = { c0, c1, r0, r1 }
      }

      drawWorldOnCanvas(
        dyn.ctx,
        enrichedWorld,
        selectedOrgIdRef.current,
        overlayRef.current,
        focusRef.current,
        viewFlagsRef.current,
        bounds,
        renderZoom,
      )
      dyn.markDirty()

      lastDrawnAt = curServerAt
      lastDrawnT = t
      lastDrawnUI = uiKey

      if (!hasDrawn.current) {
        hasDrawn.current = true
        requestAnimationFrame(() => requestAnimationFrame(onFirstDraw))
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      _imgBuf = null
      _baseCanvas = null
      _baseKey = null
    }
  }, [interp, dyn, onFirstDraw, cameraStateRef, viewportDims, rendererPaused])

  return (
    <>
      <Transform x={atX} y={atY} />
      <Sprite width={W} height={H} dynamicSrc={dyn.id} color="#ffffff" zIndex={0} />
    </>
  )
}

function CameraController({
  worldW,
  worldH,
  containerW,
  containerH,
  containerEl,
  cameraStateRef,
  followTarget,
}: {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  containerEl: HTMLDivElement | null
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  followTarget: { x: number; y: number } | null
}) {
  const camera = useCamera()
  const drag = useRef({ active: false, startPX: 0, startPY: 0, startCamX: 0, startCamY: 0 })
  const initialised = useRef(false)
  const minZoom = Math.min(containerW / worldW, containerH / worldH) * 0.85

  useEffect(() => {
    if (initialised.current) return
    const tx = worldW / 2
    const ty = worldH / 2
    const fitZoom = Math.max(minZoom, Math.min(containerW / worldW, containerH / worldH) * 0.95)
    let raf = 0
    const trySet = () => {
      camera.setPosition(tx, ty)
      camera.setZoom(fitZoom)
      const pos = camera.getPosition?.()
      if (!pos || Math.abs(pos.x - tx) > 2 || Math.abs(pos.y - ty) > 2) {
        raf = requestAnimationFrame(trySet)
      } else {
        cameraStateRef.current = { x: tx, y: ty, zoom: fitZoom }
        initialised.current = true
      }
    }
    raf = requestAnimationFrame(trySet)
    return () => cancelAnimationFrame(raf)
  }, [camera, cameraStateRef, containerH, containerW, minZoom, worldH, worldW])

  const prevFollowRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!followTarget) return
    const prev = prevFollowRef.current
    const isNewTarget =
      !prev || Math.abs(prev.x - followTarget.x) > 30 || Math.abs(prev.y - followTarget.y) > 30
    camera.setPosition(followTarget.x, followTarget.y)
    cameraStateRef.current.x = followTarget.x
    cameraStateRef.current.y = followTarget.y
    if (isNewTarget) {
      const TRACK_ZOOM = 3.5
      camera.setZoom(TRACK_ZOOM)
      cameraStateRef.current.zoom = TRACK_ZOOM
    }
    prevFollowRef.current = { x: followTarget.x, y: followTarget.y }
  }, [followTarget, camera, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return

    const clamp = (x: number, y: number, zoom: number) => {
      const halfW = containerW / (2 * zoom)
      const halfH = containerH / (2 * zoom)
      const cx = halfW >= worldW / 2 ? x : Math.max(halfW, Math.min(worldW - halfW, x))
      const cy = halfH >= worldH / 2 ? y : Math.max(halfH, Math.min(worldH - halfH, y))
      return { x: cx, y: cy }
    }

    const onDown = (e: PointerEvent) => {
      drag.current.active = true
      drag.current.startPX = e.clientX
      drag.current.startPY = e.clientY
      const pos = camera.getPosition()
      drag.current.startCamX = pos.x
      drag.current.startCamY = pos.y
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return
      const zoom = camera.getZoom()
      const raw = {
        x: drag.current.startCamX - (e.clientX - drag.current.startPX) / zoom,
        y: drag.current.startCamY - (e.clientY - drag.current.startPY) / zoom,
      }
      const { x: nx, y: ny } = clamp(raw.x, raw.y, zoom)
      camera.setPosition(nx, ny)
      cameraStateRef.current.x = nx
      cameraStateRef.current.y = ny
    }
    const onUp = () => {
      drag.current.active = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const nz = Math.max(minZoom, Math.min(8, camera.getZoom() * factor))
      camera.setZoom(nz)
      cameraStateRef.current.zoom = nz
      const pos = camera.getPosition()
      const { x, y } = clamp(pos.x, pos.y, nz)
      camera.setPosition(x, y)
      cameraStateRef.current.x = x
      cameraStateRef.current.y = y
    }

    containerEl.addEventListener('pointerdown', onDown)
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      containerEl.removeEventListener('pointerdown', onDown)
      containerEl.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [camera, cameraStateRef, containerEl, containerW, containerH, minZoom, worldW, worldH])

  const clampCam = useRef<((x: number, y: number, zoom: number) => { x: number; y: number }) | null>(null)
  clampCam.current = (x, y, zoom) => {
    const halfW = containerW / (2 * zoom)
    const halfH = containerH / (2 * zoom)
    const cx = halfW >= worldW / 2 ? x : Math.max(halfW, Math.min(worldW - halfW, x))
    const cy = halfH >= worldH / 2 ? y : Math.max(halfH, Math.min(worldH - halfH, y))
    return { x: cx, y: cy }
  }

  useGestures(
    {
      onPinch: ({ delta }) => {
        const factor = 1 + delta
        const nz = Math.max(minZoom, Math.min(8, camera.getZoom() * factor))
        camera.setZoom(nz)
        cameraStateRef.current.zoom = nz
        const pos = camera.getPosition()
        const { x, y } = clampCam.current!(pos.x, pos.y, nz)
        camera.setPosition(x, y)
        cameraStateRef.current.x = x
        cameraStateRef.current.y = y
      },
    },
    { target: containerEl },
  )

  return null
}

interface Props {
  world: WorldState
  interp?: InterpRefs
  rendererPaused?: boolean
  sandboxArmed?: boolean
  onSandboxApply?: (worldX: number, worldY: number) => void
}

export function WorldView({ world, interp, rendererPaused = false, sandboxArmed, onSandboxApply }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const followOrgId = useUIStore((s) => s.followOrgId)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const onOrgSelect = useUIStore((s) => s.selectOrg)
  const territoryIndex = useMemo(() => buildTerritoryIndex(world.territory), [world.territory])
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [mapReady, setMapReady] = useState(false)
  const gameControlsRef = useRef<GameControls | null>(null)
  const rendererPausedRef = useRef(rendererPaused)
  rendererPausedRef.current = rendererPaused

  const handleGameReady = useCallback((controls: GameControls) => {
    gameControlsRef.current = controls
    syncRendererLoopPause(controls, rendererPausedRef.current)
  }, [])

  useEffect(() => {
    const controls = gameControlsRef.current
    if (controls) syncRendererLoopPause(controls, rendererPaused)
  }, [rendererPaused])

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find((o) => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  // Track pointer-down position so we can distinguish a tap (select)
  // from a drag-then-release (pan). Without this every pan ends with
  // an accidental org-select on the tile under the release point -
  // especially painful on touch where finger jitter is large.
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (down) {
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (dx * dx + dy * dy > 36) return
    }
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    if (sandboxArmed && onSandboxApply) {
      onSandboxApply(worldX, worldY)
      return
    }

    const tx = Math.floor(worldX)
    const ty = Math.floor(worldY)

    if (viewFlags.territory) {
      const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
      const lineageId = lineageAtTerritoryTile(territoryIndex, tx, ty, focusedLineage)
      onOrgSelect(null)
      useUIStore.setState({ panelOpen: false })
      setFocus(lineageId ? `lineage:${lineageId}` : 'all')
      return
    }

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    let nearestOrg: { id: string; dist: number } | null = null
    let nearestOrgDist = isCoarse ? 5.0 : 3.0
    for (const org of world.viewport_organisms ?? world.organisms) {
      if (!org.alive) continue
      const d = Math.abs(org.x - worldX) + Math.abs(org.y - worldY)
      if (d < nearestOrgDist) {
        nearestOrgDist = d
        nearestOrg = { id: org.id, dist: d }
      }
    }
    if (nearestOrg && nearestOrg.dist < 1.2) {
      onOrgSelect(nearestOrg.id)
      return
    }

    const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
    const localCol = tx - ox
    const localRow = ty - oy
    const tileRow = world.grid?.tiles?.[localRow]
    const tileVal = tileRow ? tileRow[localCol] : undefined
    if (isWaterTile(tileVal) && (!nearestOrg || nearestOrg.dist >= 2.5)) {
      onOrgSelect(null)
      return
    }
    const isHut = tileVal === TILE_ID.HUT
    const structRow = world.grid?.structure?.[localRow]
    const structVal = (structRow && structRow[localCol]) || 0
    if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms) {
        if (!org.alive) continue
        const hx = Math.floor(org.home_x)
        const hy = Math.floor(org.home_y)
        if (hx === tx && hy === ty) {
          if (!bestHost || org.age > bestHost.age) {
            bestHost = { id: org.id, age: org.age }
          }
        }
      }
      if (bestHost) {
        useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
        return
      }
    }

    onOrgSelect(nearestOrg ? nearestOrg.id : null)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ w: clientWidth, h: clientHeight })
      }
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        cursor: sandboxArmed ? 'crosshair' : 'grab',
        position: 'relative',
        // touch-action: none stops the browser from claiming
        // two-finger pinch as page-zoom; the gesture handler
        // gets the events instead.
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#1a4a80',
          zIndex: 10,
          pointerEvents: 'none',
          opacity: mapReady ? 0 : 1,
          transition: 'opacity 280ms ease-out',
        }}
      />
      {dims.w > 0 && (
        <Game
          gravity={0}
          width={dims.w}
          height={dims.h}
          onReady={handleGameReady}
          style={{ display: 'block' }}
        >
          <World background="#1a4a80">
            <Camera2D />

            <Entity>
              <WorldSprite
                world={world}
                interp={interp}
                selectedOrgId={selectedOrgId}
                overlay={overlay}
                focus={focus}
                viewFlags={viewFlags}
                rendererPaused={rendererPaused}
                onFirstDraw={() => setMapReady(true)}
                atX={cx}
                atY={cy}
                cameraStateRef={cameraStateRef}
                viewportDims={dims}
              />
            </Entity>

            <CameraController
              worldW={W}
              worldH={H}
              containerW={dims.w}
              containerH={dims.h}
              containerEl={containerRef.current}
              cameraStateRef={cameraStateRef}
              followTarget={followTarget}
            />
          </World>
        </Game>
      )}
    </div>
  )
}
