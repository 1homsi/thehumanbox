import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SpotLight,
} from 'three'
import type { Building, BuildingFunction, BuildingKind } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[]
  depthMap: number[][]
  biomes: number[][]
  dayProgress?: number
}

const NIGHT_WINDOW = new BoxGeometry(0.8, 0.8, 0.05)

interface WindowSpec {
  yOffset: number
  spread: number
  perSide: number
  forwardZ: number
}

const WINDOW_SPECS: Partial<Record<string, WindowSpec>> = {
  House: { yOffset: 3.5, spread: 6.0, perSide: 2, forwardZ: 4.6 },
  Manor: { yOffset: 4.5, spread: 8.0, perSide: 2, forwardZ: 5.6 },
  TownHouse: { yOffset: 6.0, spread: 4.0, perSide: 2, forwardZ: 3.4 },
  Apartment: { yOffset: 8.0, spread: 4.4, perSide: 3, forwardZ: 3.0 },
  Cafe: { yOffset: 1.8, spread: 3.2, perSide: 2, forwardZ: 2.1 },
  Restaurant: { yOffset: 2.1, spread: 4.0, perSide: 2, forwardZ: 2.1 },
  Tavern: { yOffset: 2.3, spread: 4.0, perSide: 2, forwardZ: 2.5 },
  Inn: { yOffset: 2.7, spread: 4.0, perSide: 2, forwardZ: 2.7 },
  Library: { yOffset: 2.6, spread: 4.4, perSide: 2, forwardZ: 2.8 },
  Brewery: { yOffset: 2.5, spread: 4.0, perSide: 2, forwardZ: 2.6 },
  Tailor: { yOffset: 2.1, spread: 3.2, perSide: 2, forwardZ: 2.1 },
  Butcher: { yOffset: 1.7, spread: 3.0, perSide: 2, forwardZ: 2.0 },
  Bakery: { yOffset: 1.9, spread: 3.4, perSide: 2, forwardZ: 2.1 },
  OfficeTower: { yOffset: 6.5, spread: 3.6, perSide: 3, forwardZ: 2.6 },
  Skyscraper: { yOffset: 8.5, spread: 4.4, perSide: 3, forwardZ: 3.1 },
}

const FN_DEFAULT: Partial<Record<BuildingKind, BuildingFunction>> = {
  Hut: 'Housing',
  House: 'Housing',
  Manor: 'Housing',
  TownHouse: 'Housing',
  Apartment: 'Housing',
  School: 'Education',
  University: 'Education',
  Library: 'Education',
  Market: 'Commerce',
  Temple: 'Worship',
  Factory: 'Industry',
  Hospital: 'Healthcare',
  Forge: 'Industry',
  Mill: 'Industry',
  Windmill: 'Industry',
  Watermill: 'Industry',
  Lighthouse: 'Civic',
  Tower: 'Military',
  Bridge: 'Infrastructure',
  Wall: 'Military',
  Aqueduct: 'Infrastructure',
}

const FN_COLOR: Record<BuildingFunction, string> = {
  Housing: '#9a7a50',
  Education: '#d6c39a',
  Industry: '#6a6a6a',
  Healthcare: '#f0f0f0',
  Worship: '#c8a040',
  Military: '#4a4a4a',
  Civic: '#bcb098',
  Commerce: '#c88030',
  Infrastructure: '#8a8a8a',
}

const ROOF_DARK = '#4a2a18'
const ROOF_TILE = '#7a4628'

const HUT_GEO = (() => {
  const g = new ConeGeometry(4.6, 6.4, 6)
  return g
})()
const HOUSE_WALL = new BoxGeometry(8.0, 5.4, 9.0)
const HOUSE_ROOF = (() => {
  const g = new ConeGeometry(6.4, 4.0, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const HOUSE_CHIMNEY = new BoxGeometry(0.9, 2.0, 0.9)
const MANOR_WALL_A = new BoxGeometry(10.4, 9.4, 11.2)
const MANOR_WALL_B = new BoxGeometry(6.4, 6.6, 7.2)
const MANOR_ROOF_A = (() => {
  const g = new ConeGeometry(8.4, 5.2, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const MANOR_ROOF_B = (() => {
  const g = new ConeGeometry(5.4, 3.6, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const TOWNHOUSE_GEO = new BoxGeometry(5.6, 13.4, 6.4)
const TOWNHOUSE_ROOF = (() => {
  const g = new ConeGeometry(4.4, 2.8, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const APARTMENT_GEO = new BoxGeometry(5.6, 14.0, 5.6)
const SCHOOL_MID = new BoxGeometry(2.0, 3.6, 5.0)
const SCHOOL_WING = new BoxGeometry(2.0, 3.6, 2.0)
const UNI_BLOCK = new BoxGeometry(7.0, 7.0, 5.0)
const UNI_COL = new CylinderGeometry(0.32, 0.32, 5.6, 8)
const LIB_BASE = new BoxGeometry(5.0, 3.6, 6.0)
const LIB_ROOF = (() => {
  const g = new ConeGeometry(4.0, 1.8, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const LIB_BOOK = new BoxGeometry(0.5, 0.9, 0.32)
const MARKET_ROOF = new BoxGeometry(5.6, 0.28, 4.4)
const MARKET_POST = new CylinderGeometry(0.18, 0.2, 3.2, 6)
const TEMPLE_T1 = new BoxGeometry(7.0, 2.2, 7.0)
const TEMPLE_T2 = new BoxGeometry(5.4, 2.0, 5.4)
const TEMPLE_T3 = new BoxGeometry(3.8, 1.8, 3.8)
const TEMPLE_T4 = new BoxGeometry(2.2, 1.6, 2.2)
const FACTORY_BLOCK = new BoxGeometry(7.0, 4.4, 5.0)
const FACTORY_STACK = new CylinderGeometry(0.45, 0.55, 5.6, 8)
const HOSP_BLOCK = new BoxGeometry(5.6, 4.4, 5.0)
const HOSP_CROSS_V = new PlaneGeometry(0.6, 1.6)
const HOSP_CROSS_H = new PlaneGeometry(1.6, 0.6)
const FORGE_BLOCK = new BoxGeometry(4.0, 2.6, 4.0)
const FORGE_WIN = new PlaneGeometry(1.2, 0.9)
const MILL_BASE = new BoxGeometry(3.6, 3.4, 3.6)
const MILL_ROOF = (() => {
  const g = new ConeGeometry(3.0, 1.6, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const BLADE_HUB = new CylinderGeometry(0.28, 0.28, 0.4, 8)
const BLADE_ARM = new BoxGeometry(0.18, 4.4, 0.42)
const WATER_PADDLE = new BoxGeometry(0.22, 3.0, 0.55)
const LIGHTHOUSE_COL = new CylinderGeometry(0.95, 1.2, 8.5, 10)
const LIGHTHOUSE_TOP = new CylinderGeometry(0.65, 0.85, 1.6, 10)
const LIGHTHOUSE_CAP = (() => {
  const g = new ConeGeometry(0.9, 1.0, 8)
  return g
})()
const TOWER_COL = new CylinderGeometry(1.2, 1.4, 9.0, 8)
const TOWER_CAP = (() => {
  const g = new ConeGeometry(1.55, 2.0, 8)
  return g
})()
const BRIDGE_GEO = new BoxGeometry(8.0, 0.5, 1.8)
const WALL_GEO = new BoxGeometry(8.0, 2.4, 0.8)
const AQUE_TOP = new BoxGeometry(8.0, 0.6, 1.6)
const AQUE_LEG = new BoxGeometry(0.7, 3.0, 1.4)

// Workshop polish — extra geometry layered on top of the GENERIC_SPECS
// base box so each kind reads as more than a coloured rectangle.
const ROOF_CAFE = (() => {
  const g = new ConeGeometry(2.8, 1.4, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const ROOF_BREWERY = (() => {
  const g = new ConeGeometry(3.4, 2.4, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const ROOF_TAILOR = (() => {
  const g = new ConeGeometry(2.9, 1.8, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const ROOF_BUTCHER = (() => {
  const g = new ConeGeometry(2.8, 1.6, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const ROOF_BAKERY = (() => {
  const g = new ConeGeometry(3.0, 1.6, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const ROOF_LIBRARY = (() => {
  const g = new ConeGeometry(3.4, 2.0, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const SMOKESTACK = new CylinderGeometry(0.55, 0.7, 4.0, 8)
const SMOKESTACK_TIP = new CylinderGeometry(0.65, 0.65, 0.4, 8)
const AWNING = new BoxGeometry(4.6, 0.2, 1.6)
const SIGN = new BoxGeometry(2.4, 0.8, 0.16)
const FORGE_CHIMNEY = new CylinderGeometry(0.4, 0.5, 2.6, 6)
const SPIRE_BASE = new ConeGeometry(1.4, 2.6, 8)
const SPIRE_TIP = new CylinderGeometry(0.18, 0.18, 0.9, 6)
const SERVER_RACK = new BoxGeometry(0.7, 3.4, 0.5)

interface PolishLayer {
  geometry: import('three').BufferGeometry
  yOffset: number
  color: string
  dx?: number
  dz?: number
  emissive?: string
  emissiveIntensity?: number
}

const WORKSHOP_POLISH: Partial<Record<string, { layers: PolishLayer[] }>> = {
  Cafe: {
    layers: [
      { geometry: ROOF_CAFE, yOffset: 4.0, color: '#3a2418' },
      { geometry: AWNING, yOffset: 2.6, color: '#c84030', dz: 1.6 },
      { geometry: SIGN, yOffset: 3.4, color: '#3a1a08', dz: 2.05, emissive: '#ffa44a', emissiveIntensity: 0.12 },
    ],
  },
  Restaurant: {
    layers: [
      { geometry: ROOF_CAFE, yOffset: 4.4, color: '#3a2418' },
      { geometry: AWNING, yOffset: 3.0, color: '#a83a30', dz: 1.6 },
    ],
  },
  Brewery: {
    layers: [
      { geometry: ROOF_BREWERY, yOffset: 6.3, color: '#2a1810' },
      { geometry: SMOKESTACK, yOffset: 6.5, color: '#5a4a38', dx: 1.5, dz: -1.2 },
      { geometry: SMOKESTACK_TIP, yOffset: 8.6, color: '#3a2a20', dx: 1.5, dz: -1.2 },
    ],
  },
  Tailor: {
    layers: [
      { geometry: ROOF_TAILOR, yOffset: 4.9, color: '#3a1830' },
      { geometry: SIGN, yOffset: 3.8, color: '#3a1830', dz: 2.05, emissive: '#d870e0', emissiveIntensity: 0.1 },
    ],
  },
  ClothingShop: {
    layers: [
      { geometry: ROOF_TAILOR, yOffset: 5.0, color: '#3a1828' },
      { geometry: AWNING, yOffset: 3.3, color: '#a04080', dz: 1.7 },
    ],
  },
  Butcher: {
    layers: [
      { geometry: ROOF_BUTCHER, yOffset: 4.3, color: '#4a1a10' },
      { geometry: SIGN, yOffset: 3.4, color: '#3a1008', dz: 2.05 },
    ],
  },
  Bakery: {
    layers: [
      { geometry: ROOF_BAKERY, yOffset: 4.3, color: '#3a2418' },
      { geometry: AWNING, yOffset: 2.9, color: '#d8a058', dz: 1.6 },
      { geometry: SMOKESTACK, yOffset: 5.6, color: '#5a4a38', dx: 1.4, dz: -1.0 },
    ],
  },
  Library: {
    layers: [
      { geometry: ROOF_LIBRARY, yOffset: 5.4, color: '#2a1408' },
    ],
  },
  Scribe: {
    layers: [{ geometry: ROOF_LIBRARY, yOffset: 5.4, color: '#2a1408' }],
  },
  BookStore: {
    layers: [
      { geometry: ROOF_LIBRARY, yOffset: 5.4, color: '#2a1408' },
      { geometry: SIGN, yOffset: 3.6, color: '#3a2010', dz: 2.05, emissive: '#d8b270', emissiveIntensity: 0.08 },
    ],
  },
  Factory: {
    layers: [
      { geometry: SMOKESTACK, yOffset: 7.5, color: '#3a3028', dx: 1.6, dz: -1.4 },
      { geometry: SMOKESTACK_TIP, yOffset: 9.6, color: '#1a1410', dx: 1.6, dz: -1.4 },
      { geometry: SMOKESTACK, yOffset: 7.0, color: '#3a3028', dx: -1.6, dz: -1.4 },
      { geometry: SMOKESTACK_TIP, yOffset: 9.1, color: '#1a1410', dx: -1.6, dz: -1.4 },
    ],
  },
  Forge: {
    layers: [
      { geometry: FORGE_CHIMNEY, yOffset: 4.3, color: '#3a1808', dx: 0, dz: -1.2, emissive: '#ff5020', emissiveIntensity: 0.35 },
    ],
  },
  Smithy: {
    layers: [
      { geometry: FORGE_CHIMNEY, yOffset: 4.3, color: '#3a1808', dx: 0, dz: -1.2, emissive: '#ff5020', emissiveIntensity: 0.35 },
    ],
  },
  Refinery: {
    layers: [
      { geometry: SMOKESTACK, yOffset: 9.5, color: '#5a4838', dx: 2.0, dz: 0 },
      { geometry: SMOKESTACK_TIP, yOffset: 11.7, color: '#1a1410', dx: 2.0, dz: 0, emissive: '#ff8040', emissiveIntensity: 0.4 },
    ],
  },
  Datacenter: {
    layers: [
      { geometry: SERVER_RACK, yOffset: 5.7, color: '#1a2028', dx: -1.6, dz: 0, emissive: '#20a8d0', emissiveIntensity: 0.3 },
      { geometry: SERVER_RACK, yOffset: 5.7, color: '#1a2028', dx: 1.6, dz: 0, emissive: '#20a8d0', emissiveIntensity: 0.3 },
    ],
  },
  Temple: {
    layers: [
      { geometry: SPIRE_BASE, yOffset: 4.3, color: '#3a2418' },
      { geometry: SPIRE_TIP, yOffset: 6.0, color: '#d8b270', emissive: '#f0d090', emissiveIntensity: 0.15 },
    ],
  },
  Shrine: {
    layers: [
      { geometry: SPIRE_BASE, yOffset: 3.0, color: '#3a2418' },
    ],
  },
  Cathedral: {
    layers: [
      { geometry: SPIRE_BASE, yOffset: 8.5, color: '#3a2418' },
      { geometry: SPIRE_TIP, yOffset: 10.5, color: '#d8b270', emissive: '#f0d090', emissiveIntensity: 0.2 },
    ],
  },
}

interface GenericSpec {
  color: string
  width: number
  height: number
  depth: number
  yOffset: number
  emissive?: string
  emissiveIntensity?: number
}

const GENERIC_SPECS: Record<string, GenericSpec> = {
  Tavern: { color: '#7a4a28', width: 5, height: 4, depth: 5, yOffset: 2.0 },
  Brewery: { color: '#7a4a28', width: 5, height: 5, depth: 5, yOffset: 2.5 },
  Butcher: { color: '#a04848', width: 4, height: 3.5, depth: 4, yOffset: 1.75 },
  Fishmonger: { color: '#6890b0', width: 4, height: 3.5, depth: 4, yOffset: 1.75 },
  Cheesemonger: { color: '#e8c878', width: 4, height: 3.5, depth: 4, yOffset: 1.75 },
  Tailor: { color: '#9870a8', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Cobbler: { color: '#604030', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  ClothingShop: { color: '#c870a0', width: 5, height: 4, depth: 4, yOffset: 2.0 },
  Jeweler: { color: '#a89060', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Apothecary: { color: '#608860', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Herbalist: { color: '#608848', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Barbershop: { color: '#c8c8c8', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Scribe: { color: '#c8b078', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  BookStore: { color: '#684830', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  ArtGallery: { color: '#a86880', width: 5, height: 4, depth: 5, yOffset: 2.0 },
  MusicHall: { color: '#5050a8', width: 6, height: 5, depth: 5, yOffset: 2.5 },
  Cafe: { color: '#704830', width: 4, height: 3.5, depth: 4, yOffset: 1.75 },
  Restaurant: { color: '#a87048', width: 5, height: 4, depth: 4, yOffset: 2.0 },
  Hotel: { color: '#c0a070', width: 6, height: 8, depth: 5, yOffset: 4.0 },
  GuildHall: { color: '#5878a8', width: 5, height: 5, depth: 5, yOffset: 2.5 },
  Courthouse: { color: '#a8a090', width: 6, height: 6, depth: 5, yOffset: 3.0 },
  CityHall: { color: '#b8a060', width: 6, height: 6, depth: 5, yOffset: 3.0 },
  PostOffice: { color: '#a05848', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  PoliceStation: { color: '#3050a0', width: 5, height: 4, depth: 4, yOffset: 2.0 },
  FireStation: { color: '#c83020', width: 5, height: 4, depth: 4, yOffset: 2.0, emissive: '#c83020', emissiveIntensity: 0.3 },
  Pharmacy: { color: '#48a070', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Clinic: { color: '#e8e8e8', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Spa: { color: '#c8a0c0', width: 5, height: 3, depth: 4, yOffset: 1.5 },
  Bathhouse: { color: '#a0c0d8', width: 5, height: 3, depth: 5, yOffset: 1.5 },
  Greenhouse: { color: '#b0e0a0', width: 5, height: 4, depth: 5, yOffset: 2.0, emissive: '#80c060', emissiveIntensity: 0.1 },
  Vineyard: { color: '#80a060', width: 5, height: 1, depth: 5, yOffset: 0.5 },
  Ranch: { color: '#a87850', width: 6, height: 3, depth: 6, yOffset: 1.5 },
  Stable: { color: '#785030', width: 5, height: 3, depth: 4, yOffset: 1.5 },
  Kennel: { color: '#684838', width: 4, height: 2.5, depth: 4, yOffset: 1.25 },
  Dovecote: { color: '#a09078', width: 2, height: 4, depth: 2, yOffset: 2.0 },
  Quarry: { color: '#909090', width: 5, height: 1, depth: 5, yOffset: 0.5 },
  Mine: { color: '#605050', width: 4, height: 2, depth: 4, yOffset: 1.0 },
  SawMill: { color: '#a07848', width: 5, height: 3, depth: 5, yOffset: 1.5 },
  Tannery: { color: '#7a5838', width: 5, height: 3, depth: 4, yOffset: 1.5 },
  Smithy: { color: '#604030', width: 4, height: 3, depth: 4, yOffset: 1.5, emissive: '#ff6020', emissiveIntensity: 0.4 },
  Goldsmith: { color: '#d8b048', width: 4, height: 3, depth: 4, yOffset: 1.5 },
  Refinery: { color: '#807868', width: 6, height: 6, depth: 6, yOffset: 3.0 },
  PowerPlant: { color: '#808080', width: 6, height: 5, depth: 6, yOffset: 2.5 },
  Substation: { color: '#a0a0a0', width: 4, height: 3, depth: 4, yOffset: 1.5 },
  WaterTower: { color: '#a8b0b8', width: 3, height: 7, depth: 3, yOffset: 3.5 },
  Reservoir: { color: '#5878a0', width: 6, height: 1, depth: 6, yOffset: 0.5 },
  GasStation: { color: '#d8a020', width: 5, height: 3, depth: 4, yOffset: 1.5 },
  AutoShop: { color: '#606060', width: 5, height: 3, depth: 4, yOffset: 1.5 },
  Garage: { color: '#707070', width: 4, height: 3, depth: 4, yOffset: 1.5 },
  MallShop: { color: '#a0a8b8', width: 6, height: 4, depth: 6, yOffset: 2.0 },
  Supermarket: { color: '#48a048', width: 6, height: 4, depth: 5, yOffset: 2.0 },
  OfficeTower: { color: '#88a0b8', width: 5, height: 11, depth: 5, yOffset: 5.5, emissive: '#88a0b8', emissiveIntensity: 0.1 },
  Skyscraper: { color: '#5070a0', width: 6, height: 16, depth: 6, yOffset: 8.0, emissive: '#a0c0e0', emissiveIntensity: 0.15 },
  Datacenter: { color: '#202830', width: 6, height: 4, depth: 5, yOffset: 2.0, emissive: '#20a8d0', emissiveIntensity: 0.3 },
  Studio: { color: '#383848', width: 5, height: 4, depth: 4, yOffset: 2.0 },
  Spaceport: { color: '#a0a0c0', width: 8, height: 4, depth: 8, yOffset: 2.0 },
  OrbitalLift: { color: '#7080a0', width: 4, height: 24, depth: 4, yOffset: 12.0, emissive: '#a0c0ff', emissiveIntensity: 0.4 },
  SolarArray: { color: '#2050a0', width: 7, height: 0.4, depth: 7, yOffset: 1.0, emissive: '#1030a0', emissiveIntensity: 0.3 },
  WindFarm: { color: '#c8d8e8', width: 7, height: 12, depth: 7, yOffset: 6.0 },
  FusionPlant: { color: '#a020a0', width: 6, height: 6, depth: 6, yOffset: 3.0, emissive: '#ff20ff', emissiveIntensity: 0.6 },
  NeuralHub: { color: '#a050d0', width: 6, height: 4, depth: 5, yOffset: 2.0, emissive: '#c060ff', emissiveIntensity: 0.5 },
  AiCore: { color: '#20c0d0', width: 5, height: 5, depth: 5, yOffset: 2.5, emissive: '#20c0d0', emissiveIntensity: 0.6 },
  Biodome: { color: '#80e090', width: 7, height: 5, depth: 7, yOffset: 2.5, emissive: '#80ff80', emissiveIntensity: 0.2 },
  Cryolab: { color: '#c8e0f0', width: 5, height: 4, depth: 5, yOffset: 2.0, emissive: '#a0d0ff', emissiveIntensity: 0.3 },
  NanoFab: { color: '#80a0c0', width: 5, height: 4, depth: 5, yOffset: 2.0 },
  Hyperloop: { color: '#404868', width: 12, height: 1, depth: 1.5, yOffset: 0.5, emissive: '#6080a0', emissiveIntensity: 0.4 },
  Maglev: { color: '#506880', width: 12, height: 1, depth: 1.5, yOffset: 0.5 },
  Hospital2: { color: '#f0f0f0', width: 7, height: 8, depth: 7, yOffset: 4.0, emissive: '#ff4040', emissiveIntensity: 0.3 },
  ResearchLab: { color: '#a8c0d8', width: 5, height: 4, depth: 5, yOffset: 2.0 },
  Megastructure: { color: '#404060', width: 12, height: 20, depth: 12, yOffset: 10.0, emissive: '#8060c0', emissiveIntensity: 0.5 },
  Well: { color: '#807060', width: 1.2, height: 1.2, depth: 1.2, yOffset: 0.6 },
  Lamppost: { color: '#303030', width: 0.3, height: 3.5, depth: 0.3, yOffset: 1.75, emissive: '#ffd060', emissiveIntensity: 1.2 },
  Signpost: { color: '#785030', width: 0.3, height: 2.5, depth: 0.3, yOffset: 1.25 },
  MarketStall: { color: '#c87840', width: 1.5, height: 1.5, depth: 1.5, yOffset: 0.75 },
  FoodCart: { color: '#a05030', width: 1.4, height: 1.3, depth: 1.4, yOffset: 0.65 },
  Cart: { color: '#604838', width: 1.4, height: 1.0, depth: 1.4, yOffset: 0.5 },
  Tent: { color: '#a89060', width: 1.5, height: 1.8, depth: 1.5, yOffset: 0.9 },
  Pavilion: { color: '#c8a878', width: 4, height: 2.5, depth: 4, yOffset: 1.25 },
  Gazebo: { color: '#a89878', width: 2.5, height: 2.5, depth: 2.5, yOffset: 1.25 },
  Bench: { color: '#5a3818', width: 1.4, height: 0.4, depth: 0.5, yOffset: 0.2 },
  Fence: { color: '#604838', width: 1, height: 1, depth: 0.2, yOffset: 0.5 },
  Gate: { color: '#604838', width: 1.4, height: 2.2, depth: 0.4, yOffset: 1.1 },
  Watchtower: { color: '#605040', width: 2, height: 6, depth: 2, yOffset: 3.0 },
  Gallows: { color: '#4a2a18', width: 1.2, height: 3.5, depth: 1.2, yOffset: 1.75 },
  Monument: { color: '#a8a098', width: 2, height: 4, depth: 2, yOffset: 2.0 },
  Obelisk: { color: '#888080', width: 1, height: 5, depth: 1, yOffset: 2.5 },
  Shrine: { color: '#c8a050', width: 1.5, height: 2, depth: 1.5, yOffset: 1.0, emissive: '#ffb040', emissiveIntensity: 0.4 },
  Cemetery: { color: '#808080', width: 4, height: 0.4, depth: 4, yOffset: 0.2 },
  GraveStone: { color: '#909090', width: 0.8, height: 1.2, depth: 0.3, yOffset: 0.6 },
  Garden: { color: '#80b070', width: 4, height: 0.4, depth: 4, yOffset: 0.2 },
  Orchard: { color: '#608838', width: 4, height: 0.4, depth: 4, yOffset: 0.2 },
  Pond: { color: '#5078a0', width: 2.5, height: 0.3, depth: 2.5, yOffset: 0.15, emissive: '#3060a0', emissiveIntensity: 0.2 },
  PlayGround: { color: '#d8a070', width: 4, height: 1.5, depth: 4, yOffset: 0.75 },
  FlagPole: { color: '#a8a8a8', width: 0.2, height: 5, depth: 0.2, yOffset: 2.5 },
  Bandstand: { color: '#a89070', width: 2.5, height: 1.5, depth: 2.5, yOffset: 0.75 },
  Kiosk: { color: '#a07050', width: 1.2, height: 1.8, depth: 1.2, yOffset: 0.9 },
  BillBoard: { color: '#b0b0b0', width: 0.3, height: 3, depth: 1.5, yOffset: 1.5 },
  TelephonePole: { color: '#604838', width: 0.3, height: 4, depth: 0.3, yOffset: 2.0 },
  StreetLight: { color: '#303030', width: 0.25, height: 3, depth: 0.25, yOffset: 1.5, emissive: '#ffe080', emissiveIntensity: 1.0 },
  BusStop: { color: '#506888', width: 1.5, height: 1.8, depth: 0.6, yOffset: 0.9 },
  ParkingLot: { color: '#404040', width: 4, height: 0.2, depth: 4, yOffset: 0.1 },
  Crosswalk: { color: '#dcdcdc', width: 1, height: 0.05, depth: 0.6, yOffset: 0.025 },
  Pyramid: { color: '#c8a868', width: 6, height: 5, depth: 6, yOffset: 2.5 },
  Ziggurat: { color: '#a88858', width: 6, height: 4.5, depth: 6, yOffset: 2.25 },
  Coliseum: { color: '#a08868', width: 7, height: 4, depth: 7, yOffset: 2.0 },
  TriumphalArch: { color: '#a8a098', width: 3, height: 3.5, depth: 1.2, yOffset: 1.75 },
  ClockTower: { color: '#a09078', width: 2.5, height: 7, depth: 2.5, yOffset: 3.5 },
  Mosque: { color: '#a8b0c8', width: 5, height: 5, depth: 5, yOffset: 2.5 },
  Synagogue: { color: '#a0a8c0', width: 4, height: 4, depth: 4, yOffset: 2.0 },
  Pagoda: { color: '#a85040', width: 3, height: 6, depth: 3, yOffset: 3.0 },
  Stupa: { color: '#c8b878', width: 2.5, height: 3, depth: 2.5, yOffset: 1.5 },
  Mausoleum: { color: '#888080', width: 2.5, height: 3, depth: 2.5, yOffset: 1.5 },
  Hangar: { color: '#606060', width: 6, height: 4, depth: 4, yOffset: 2.0 },
  Silo: { color: '#a89858', width: 2, height: 6, depth: 2, yOffset: 3.0 },
  Warehouse: { color: '#706050', width: 6, height: 4, depth: 4, yOffset: 2.0 },
  Dock: { color: '#604838', width: 4, height: 0.4, depth: 2.5, yOffset: 0.2 },
  Marina: { color: '#5878a0', width: 5, height: 0.5, depth: 4, yOffset: 0.25 },
  Lighthouse2: { color: '#e0d8c8', width: 2, height: 6, depth: 2, yOffset: 3.0, emissive: '#ffd060', emissiveIntensity: 0.6 },
  Drydock: { color: '#606870', width: 5, height: 1, depth: 4, yOffset: 0.5 },
  Crane: { color: '#a8a020', width: 2, height: 7, depth: 2, yOffset: 3.5 },
  RadioTower: { color: '#c84040', width: 1.5, height: 9, depth: 1.5, yOffset: 4.5, emissive: '#ff4040', emissiveIntensity: 0.4 },
  SatelliteDish: { color: '#a0a0a0', width: 1.5, height: 1.5, depth: 1.5, yOffset: 0.75 },
  WindTurbine: { color: '#e0e0e0', width: 0.5, height: 7, depth: 0.5, yOffset: 3.5 },
  SolarPanel: { color: '#1030a0', width: 1.2, height: 0.2, depth: 1.2, yOffset: 0.4, emissive: '#1030a0', emissiveIntensity: 0.2 },
  ChargingStation: { color: '#30c050', width: 0.6, height: 1.6, depth: 0.6, yOffset: 0.8, emissive: '#30ff60', emissiveIntensity: 0.6 },
  RoboticArm: { color: '#a8a020', width: 0.5, height: 1.8, depth: 0.5, yOffset: 0.9 },
  Drone: { color: '#404048', width: 0.6, height: 0.3, depth: 0.6, yOffset: 1.4 },
  HoloBoard: { color: '#20a8d0', width: 1.2, height: 2.5, depth: 0.2, yOffset: 1.25, emissive: '#20a8d0', emissiveIntensity: 1.0 },
  NeonSign: { color: '#e020a0', width: 1.5, height: 1.5, depth: 0.2, yOffset: 1.5, emissive: '#ff20a0', emissiveIntensity: 1.4 },
  ArcadeBox: { color: '#3030c0', width: 1, height: 2, depth: 1, yOffset: 1.0, emissive: '#a020ff', emissiveIntensity: 0.5 },
  Fountain2: { color: '#80a8c8', width: 2, height: 1.2, depth: 2, yOffset: 0.6, emissive: '#a0c0e0', emissiveIntensity: 0.3 },
  FoodTruck: { color: '#c87030', width: 2.5, height: 1.8, depth: 1.4, yOffset: 0.9 },
  Greenhouse2: { color: '#c0e8b0', width: 4, height: 3, depth: 4, yOffset: 1.5, emissive: '#a0e090', emissiveIntensity: 0.2 },
  MushroomFarm: { color: '#a06848', width: 4, height: 2, depth: 4, yOffset: 1.0 },
  Aquaculture: { color: '#3868a0', width: 4, height: 0.4, depth: 4, yOffset: 0.2, emissive: '#3060a0', emissiveIntensity: 0.2 },
  TrainStation: { color: '#604030', width: 7, height: 4, depth: 5, yOffset: 2.0 },
  Airport: { color: '#a0a8c0', width: 9, height: 3, depth: 8, yOffset: 1.5 },
  Port: { color: '#5878a0', width: 7, height: 2, depth: 5, yOffset: 1.0 },
  Stadium: { color: '#a8a098', width: 9, height: 5, depth: 9, yOffset: 2.5 },
  Museum: { color: '#a8a088', width: 6, height: 5, depth: 5, yOffset: 2.5 },
  Cathedral: { color: '#c8b878', width: 10, height: 14, depth: 10, yOffset: 7.0, emissive: '#e8d8a0', emissiveIntensity: 0.08 },
  Castle: { color: '#807868', width: 12, height: 12, depth: 12, yOffset: 6.0 },
  Theatre: { color: '#a05870', width: 6, height: 5, depth: 5, yOffset: 2.5 },
  Observatory: { color: '#a0a8b8', width: 4, height: 5, depth: 4, yOffset: 2.5, emissive: '#a0c0e0', emissiveIntensity: 0.2 },
  Plaza: { color: '#a89880', width: 5, height: 0.2, depth: 5, yOffset: 0.1 },
  Statue: { color: '#b0b0b0', width: 1, height: 3, depth: 1, yOffset: 1.5 },
  Fountain: { color: '#80a8c8', width: 1.5, height: 1, depth: 1.5, yOffset: 0.5 },
}

const GENERIC_GEOM_CACHE = new Map<string, BoxGeometry>()
function getGenericGeom(s: GenericSpec): BoxGeometry {
  const key = `${s.width}|${s.height}|${s.depth}`
  let g = GENERIC_GEOM_CACHE.get(key)
  if (!g) { g = new BoxGeometry(s.width, s.height, s.depth); GENERIC_GEOM_CACHE.set(key, g) }
  return g
}

const tmp = new Object3D()

const MAT_POOL = new Map<string, MeshStandardMaterial>()

function getMat(
  color: string,
  opts?: { emissive?: string; emissiveIntensity?: number },
): MeshStandardMaterial {
  const key = `${color}|${opts?.emissive ?? ''}|${opts?.emissiveIntensity ?? 0}`
  let m = MAT_POOL.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85 })
    if (opts?.emissive) {
      m.emissive.set(opts.emissive)
      m.emissiveIntensity = opts.emissiveIntensity ?? 1.0
    }
    MAT_POOL.set(key, m)
  }
  return m
}

interface LayerProps {
  positions: [number, number, number][]
  yOffset: number
  geometry: BufferGeometry
  color: string
  emissive?: string
  emissiveIntensity?: number
  maxCount: number
  scale?: number
  rotY?: number
}

function Layer({
  positions,
  yOffset,
  geometry,
  color,
  emissive,
  emissiveIntensity,
  maxCount,
  scale = 1,
  rotY = 0,
}: LayerProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)
  const material = getMat(color, emissive ? { emissive, emissiveIntensity } : undefined)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + yOffset, pz)
      tmp.rotation.set(0, rotY, 0)
      tmp.scale.setScalar(scale)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, count, yOffset, scale, rotY])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(1, maxCount)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

function SpinningBlades({ positions, axis }: { positions: [number, number, number][]; axis: 'z' | 'x' }) {
  const meshRef = useRef<InstancedMesh>(null)
  const count = positions.length
  const material = getMat('#3a2a1a')

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || count === 0) return
    const t = clock.getElapsedTime()
    let inst = 0
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      for (let b = 0; b < 4; b++) {
        const a = (b * Math.PI) / 2 + t * (axis === 'x' ? 1.6 : 2.2)
        tmp.position.set(px, py, pz)
        if (axis === 'z') tmp.rotation.set(0, 0, a)
        else tmp.rotation.set(a, 0, 0)
        tmp.scale.setScalar(1)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst++, tmp.matrix)
      }
    }
    mesh.count = inst
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  const geom = axis === 'z' ? BLADE_ARM : WATER_PADDLE
  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, material, Math.max(1, count * 4)]}
      castShadow
      frustumCulled={false}
    />
  )
}

function LighthouseBeams({ positions }: { positions: [number, number, number][] }) {
  const lights = useMemo(
    () =>
      positions.map(() => {
        const l = new SpotLight('#ffeac0', 18, 90, Math.PI / 9, 0.4, 1.4)
        l.castShadow = false
        return l
      }),
    [positions],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i]
      const l = lights[i]
      if (!l) continue
      l.position.set(px, py + 9.4, pz)
      const a = t * 1.2 + i * 0.7
      l.target.position.set(px + Math.cos(a) * 60, py + 3, pz + Math.sin(a) * 60)
      l.target.updateMatrixWorld()
    }
  })

  if (positions.length === 0) return null
  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={l} />
          <primitive object={l.target} />
        </group>
      ))}
    </>
  )
}

function ForgeGlows({ positions }: { positions: [number, number, number][] }) {
  if (positions.length === 0) return null
  return (
    <>
      {positions.map(([px, py, pz], i) => (
        <pointLight
          key={i}
          position={[px, py + 1.4, pz + 1.6]}
          color="#ff7028"
          intensity={2.4}
          distance={9}
          decay={1.4}
        />
      ))}
    </>
  )
}

function groupBuildings(
  buildings: Building[],
  depthMap: number[][],
  biomes: number[][],
): Record<BuildingKind, [number, number, number][]> {
  const out: Record<string, [number, number, number][]> = {}
  for (const b of buildings) {
    const px = b.x * TILE_SCALE
    const pz = b.y * TILE_SCALE
    const py = heightAt(b.x, b.y, depthMap, biomes)
    if (!out[b.kind]) out[b.kind] = []
    out[b.kind].push([px, py, pz])
  }
  return out as Record<BuildingKind, [number, number, number][]>
}

export function Buildings3D({ buildings, depthMap, biomes, dayProgress = 0.5 }: Props) {
  // Lights up windows during night (dayProgress > 0.85 || < 0.05) and the
  // hour either side of dawn/dusk.
  const nightFrac = (() => {
    const p = dayProgress
    if (p < 0.05 || p > 0.95) return 1
    if (p < 0.15) return (0.15 - p) / 0.1
    if (p > 0.78 && p < 0.95) return (p - 0.78) / 0.17
    return 0
  })()
  const windowsOn = nightFrac > 0.02
  const groups = useMemo(
    () => groupBuildings(buildings ?? [], depthMap, biomes),
    [buildings, depthMap, biomes],
  )

  const huts = groups.Hut ?? []
  const houses = groups.House ?? []
  const manors = groups.Manor ?? []
  const townhouses = groups.TownHouse ?? []
  const apartments = groups.Apartment ?? []
  const schools = groups.School ?? []
  const universities = groups.University ?? []
  const libraries = groups.Library ?? []
  const markets = groups.Market ?? []
  const temples = groups.Temple ?? []
  const factories = groups.Factory ?? []
  const hospitals = groups.Hospital ?? []
  const forges = groups.Forge ?? []
  const mills = groups.Mill ?? []
  const windmills = groups.Windmill ?? []
  const watermills = groups.Watermill ?? []
  const lighthouses = groups.Lighthouse ?? []
  const towers = groups.Tower ?? []
  const bridges = groups.Bridge ?? []
  const walls = groups.Wall ?? []
  const aqueducts = groups.Aqueduct ?? []

  const cap = (n: number) => Math.max(50, n)

  return (
    <>
      <Layer
        positions={huts}
        yOffset={3.2}
        geometry={HUT_GEO}
        color={FN_COLOR[FN_DEFAULT.Hut ?? 'Housing']}
        maxCount={cap(huts.length)}
      />

      <Layer
        positions={houses}
        yOffset={2.7}
        geometry={HOUSE_WALL}
        color={FN_COLOR[FN_DEFAULT.House ?? 'Housing']}
        maxCount={cap(houses.length)}
      />
      <Layer
        positions={houses}
        yOffset={7.4}
        geometry={HOUSE_ROOF}
        color={ROOF_TILE}
        maxCount={cap(houses.length)}
      />
      <Layer
        positions={houses.map(([x, y, z]) => [x + 2.4, y, z + 2.0] as [number, number, number])}
        yOffset={6.4}
        geometry={HOUSE_CHIMNEY}
        color="#4a3020"
        maxCount={cap(houses.length)}
      />

      <Layer
        positions={manors}
        yOffset={4.7}
        geometry={MANOR_WALL_A}
        color={FN_COLOR[FN_DEFAULT.Manor ?? 'Housing']}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors.map(([x, y, z]) => [x + 7.2, y, z] as [number, number, number])}
        yOffset={3.3}
        geometry={MANOR_WALL_B}
        color={FN_COLOR[FN_DEFAULT.Manor ?? 'Housing']}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors}
        yOffset={12.0}
        geometry={MANOR_ROOF_A}
        color={ROOF_DARK}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors.map(([x, y, z]) => [x + 7.2, y, z] as [number, number, number])}
        yOffset={8.4}
        geometry={MANOR_ROOF_B}
        color={ROOF_DARK}
        maxCount={cap(manors.length)}
      />

      <Layer
        positions={townhouses}
        yOffset={6.7}
        geometry={TOWNHOUSE_GEO}
        color="#b89070"
        maxCount={cap(townhouses.length)}
      />
      <Layer
        positions={townhouses}
        yOffset={14.6}
        geometry={TOWNHOUSE_ROOF}
        color={ROOF_DARK}
        maxCount={cap(townhouses.length)}
      />

      <Layer
        positions={apartments}
        yOffset={7.0}
        geometry={APARTMENT_GEO}
        color="#a0a0a0"
        maxCount={cap(apartments.length)}
      />

      <Layer
        positions={schools}
        yOffset={1.8}
        geometry={SCHOOL_MID}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x - 2.0, y, z - 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x + 2.0, y, z - 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x - 2.0, y, z + 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x + 2.0, y, z + 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />

      <Layer
        positions={universities}
        yOffset={3.5}
        geometry={UNI_BLOCK}
        color={FN_COLOR.Education}
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x - 2.4, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x - 0.8, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x + 0.8, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x + 2.4, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />

      <Layer
        positions={libraries}
        yOffset={1.8}
        geometry={LIB_BASE}
        color={FN_COLOR.Education}
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries}
        yOffset={4.5}
        geometry={LIB_ROOF}
        color={ROOF_DARK}
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x - 1.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#8a3030"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x - 0.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#306030"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x + 0.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#304878"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x + 1.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#a07030"
        maxCount={cap(libraries.length)}
      />

      <Layer
        positions={markets}
        yOffset={3.3}
        geometry={MARKET_ROOF}
        color={FN_COLOR.Commerce}
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x - 2.4, y, z - 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x + 2.4, y, z - 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x - 2.4, y, z + 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x + 2.4, y, z + 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />

      <Layer
        positions={temples}
        yOffset={1.1}
        geometry={TEMPLE_T1}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={3.2}
        geometry={TEMPLE_T2}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={5.1}
        geometry={TEMPLE_T3}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={6.8}
        geometry={TEMPLE_T4}
        color="#e8c870"
        maxCount={cap(temples.length)}
      />

      <Layer
        positions={factories}
        yOffset={2.2}
        geometry={FACTORY_BLOCK}
        color={FN_COLOR.Industry}
        maxCount={cap(factories.length)}
      />
      <Layer
        positions={factories.map(([x, y, z]) => [x - 2.2, y, z - 1.6] as [number, number, number])}
        yOffset={7.2}
        geometry={FACTORY_STACK}
        color="#3a3a3a"
        maxCount={cap(factories.length)}
      />
      <Layer
        positions={factories.map(([x, y, z]) => [x + 2.2, y, z - 1.6] as [number, number, number])}
        yOffset={7.2}
        geometry={FACTORY_STACK}
        color="#3a3a3a"
        maxCount={cap(factories.length)}
      />

      <Layer
        positions={hospitals}
        yOffset={2.2}
        geometry={HOSP_BLOCK}
        color={FN_COLOR.Healthcare}
        maxCount={cap(hospitals.length)}
      />
      <Layer
        positions={hospitals.map(([x, y, z]) => [x, y, z + 2.55] as [number, number, number])}
        yOffset={2.6}
        geometry={HOSP_CROSS_V}
        color="#ffffff"
        emissive="#d83030"
        emissiveIntensity={1.4}
        maxCount={cap(hospitals.length)}
      />
      <Layer
        positions={hospitals.map(([x, y, z]) => [x, y, z + 2.56] as [number, number, number])}
        yOffset={2.6}
        geometry={HOSP_CROSS_H}
        color="#ffffff"
        emissive="#d83030"
        emissiveIntensity={1.4}
        maxCount={cap(hospitals.length)}
      />

      <Layer
        positions={forges}
        yOffset={1.3}
        geometry={FORGE_BLOCK}
        color="#5a4030"
        maxCount={cap(forges.length)}
      />
      <Layer
        positions={forges.map(([x, y, z]) => [x, y, z + 2.05] as [number, number, number])}
        yOffset={1.6}
        geometry={FORGE_WIN}
        color="#ff8030"
        emissive="#ff7020"
        emissiveIntensity={2.2}
        maxCount={cap(forges.length)}
      />
      <ForgeGlows positions={forges} />

      <Layer
        positions={mills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(mills.length)}
      />
      <Layer
        positions={mills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(mills.length)}
      />

      <Layer
        positions={windmills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(windmills.length)}
      />
      <Layer
        positions={windmills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(windmills.length)}
      />
      <Layer
        positions={windmills.map(([x, y, z]) => [x, y, z + 1.9] as [number, number, number])}
        yOffset={4.2}
        geometry={BLADE_HUB}
        color="#3a2a1a"
        maxCount={cap(windmills.length)}
        rotY={Math.PI / 2}
      />
      <SpinningBlades
        positions={windmills.map(([x, y, z]) => [x, y + 4.2, z + 2.1] as [number, number, number])}
        axis="z"
      />

      <Layer
        positions={watermills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(watermills.length)}
      />
      <Layer
        positions={watermills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(watermills.length)}
      />
      <SpinningBlades
        positions={watermills.map(([x, y, z]) => [x + 2.2, y + 1.6, z] as [number, number, number])}
        axis="x"
      />

      <Layer
        positions={lighthouses}
        yOffset={4.25}
        geometry={LIGHTHOUSE_COL}
        color="#e8e0d0"
        maxCount={cap(lighthouses.length)}
      />
      <Layer
        positions={lighthouses}
        yOffset={9.3}
        geometry={LIGHTHOUSE_TOP}
        color="#ffe8a0"
        emissive="#ffd060"
        emissiveIntensity={1.4}
        maxCount={cap(lighthouses.length)}
      />
      <Layer
        positions={lighthouses}
        yOffset={10.6}
        geometry={LIGHTHOUSE_CAP}
        color={ROOF_DARK}
        maxCount={cap(lighthouses.length)}
      />
      <LighthouseBeams positions={lighthouses} />

      <Layer
        positions={towers}
        yOffset={4.5}
        geometry={TOWER_COL}
        color={FN_COLOR.Military}
        maxCount={cap(towers.length)}
      />
      <Layer
        positions={towers}
        yOffset={10.0}
        geometry={TOWER_CAP}
        color={ROOF_DARK}
        maxCount={cap(towers.length)}
      />

      <Layer
        positions={bridges}
        yOffset={0.4}
        geometry={BRIDGE_GEO}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(bridges.length)}
      />

      <Layer
        positions={walls}
        yOffset={1.2}
        geometry={WALL_GEO}
        color="#7a7268"
        maxCount={cap(walls.length)}
      />

      <Layer
        positions={aqueducts}
        yOffset={3.6}
        geometry={AQUE_TOP}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x - 3.0, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x + 3.0, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />

      {Object.entries(GENERIC_SPECS).map(([kind, spec]) => {
        const positions = groups[kind as BuildingKind] ?? []
        if (positions.length === 0) return null
        return (
          <Layer
            key={kind}
            positions={positions}
            yOffset={spec.yOffset}
            geometry={getGenericGeom(spec)}
            color={spec.color}
            emissive={spec.emissive}
            emissiveIntensity={spec.emissiveIntensity}
            maxCount={cap(positions.length)}
          />
        )
      })}

      {windowsOn && Object.entries(WINDOW_SPECS).map(([kind, spec]) => {
        if (!spec) return null
        const positions = groups[kind as BuildingKind] ?? []
        if (positions.length === 0) return null
        const intensity = nightFrac * 1.6
        // Lay perSide windows along the front face, mirrored on the back.
        const offsets: [number, number, number][] = []
        for (let s = -1; s <= 1; s += 2) {
          for (let i = 0; i < spec.perSide; i++) {
            const t = (i + 1) / (spec.perSide + 1) - 0.5
            offsets.push([t * spec.spread, 0, s * spec.forwardZ])
          }
        }
        return (
          <group key={`window-${kind}`}>
            {offsets.map((off, idx) => (
              <Layer
                key={`${kind}-w-${idx}`}
                positions={positions.map(
                  ([x, y, z]) => [x + off[0], y, z + off[2]] as [number, number, number],
                )}
                yOffset={spec.yOffset}
                geometry={NIGHT_WINDOW}
                color="#3a2a18"
                emissive="#ffcc78"
                emissiveIntensity={intensity}
                maxCount={cap(positions.length)}
              />
            ))}
          </group>
        )
      })}

      {Object.entries(WORKSHOP_POLISH).map(([kind, polish]) => {
        if (!polish) return null
        const positions = groups[kind as BuildingKind] ?? []
        if (positions.length === 0) return null
        return (
          <group key={`polish-${kind}`}>
            {polish.layers.map((l, i) => (
              <Layer
                key={`${kind}-${i}`}
                positions={positions.map(([x, y, z]) => [x + (l.dx ?? 0), y, z + (l.dz ?? 0)] as [number, number, number])}
                yOffset={l.yOffset}
                geometry={l.geometry}
                color={l.color}
                emissive={l.emissive}
                emissiveIntensity={l.emissiveIntensity}
                maxCount={cap(positions.length)}
              />
            ))}
          </group>
        )
      })}
    </>
  )
}
