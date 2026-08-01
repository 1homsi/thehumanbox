import { getBuildingSprite, hasBuildingSprite, PAD, PAD_BOT } from './building-sprites'
import type { Building } from '../../types'
import { getBuildingState, type BuildingState } from '../../world/building-state'

export const BUILDING_EMOJI: Record<string, string> = {
  Hut: '\u{1F6D6}',
  House: '\u{1F3E0}',
  Manor: '\u{1F3F0}',
  TownHouse: '\u{1F3D8}\u{FE0F}',
  Apartment: '\u{1F3E2}',
  School: '\u{1F3EB}',
  University: '\u{1F393}',
  Library: '\u{1F4DA}',
  Market: '\u{1F3EA}',
  Temple: '\u{26EA}',
  Factory: '\u{1F3ED}',
  Hospital: '\u{1F3E5}',
  Forge: '\u{1F9F1}',
  Mill: '\u{2699}\u{FE0F}',
  Bakery: '\u{1F35E}',
  Inn: '\u{1F37B}',
  Bank: '\u{1F3E6}',
  Workshop: '\u{1F528}',
  Granary: '\u{1F33E}',
  Barracks: '\u{1F6E1}\u{FE0F}',
  Lighthouse: '\u{1F5FC}',
  Windmill: '\u{1F4A8}',
  Watermill: '\u{1F4A7}',
  Aqueduct: '\u{1F3DB}\u{FE0F}',
  Bridge: '\u{1F309}',
  Wall: '\u{1F9F1}',
  Tower: '\u{1F5FC}',
  Plaza: '\u{1F3DE}\u{FE0F}',
  Statue: '\u{1F5FF}',
  TrainStation: '\u{1F689}',
  Airport: '\u{2708}\u{FE0F}',
  Port: '\u{2693}',
  Stadium: '\u{1F3DF}\u{FE0F}',
  Museum: '\u{1F3DB}\u{FE0F}',
  Cathedral: '\u{26EA}',
  Castle: '\u{1F3F0}',
  Theatre: '\u{1F3AD}',
  Observatory: '\u{1F52D}',
  Tavern: '\u{1F37A}',
  Brewery: '\u{1F37B}',
  Butcher: '\u{1F969}',
  Fishmonger: '\u{1F41F}',
  Cheesemonger: '\u{1F9C0}',
  Tailor: '\u{1F9F5}',
  Cobbler: '\u{1F45E}',
  ClothingShop: '\u{1F457}',
  Jeweler: '\u{1F48E}',
  Apothecary: '\u{1F48A}',
  Herbalist: '\u{1F33F}',
  Barbershop: '\u{1F487}',
  Scribe: '\u{1F4DC}',
  BookStore: '\u{1F4D6}',
  ArtGallery: '\u{1F5BC}\u{FE0F}',
  MusicHall: '\u{1F3B6}',
  Cafe: '\u{2615}',
  Restaurant: '\u{1F37D}\u{FE0F}',
  Hotel: '\u{1F3E8}',
  GuildHall: '\u{2696}\u{FE0F}',
  Courthouse: '\u{2696}\u{FE0F}',
  CityHall: '\u{1F3DB}\u{FE0F}',
  PostOffice: '\u{1F4EE}',
  PoliceStation: '\u{1F46E}',
  FireStation: '\u{1F692}',
  Pharmacy: '\u{1F48A}',
  Clinic: '\u{2695}\u{FE0F}',
  Spa: '\u{1F486}',
  Bathhouse: '\u{1F6C1}',
  Greenhouse: '\u{1F33F}',
  Vineyard: '\u{1F347}',
  Ranch: '\u{1F40E}',
  Stable: '\u{1F40E}',
  Kennel: '\u{1F415}',
  Dovecote: '\u{1F54A}\u{FE0F}',
  Quarry: '\u{26CF}\u{FE0F}',
  Mine: '\u{1F6A7}',
  SawMill: '\u{1FAB5}',
  Tannery: '\u{1F9F1}',
  Smithy: '\u{1F528}',
  Goldsmith: '\u{1F4B0}',
  Refinery: '\u{1F6E2}\u{FE0F}',
  PowerPlant: '\u{26A1}',
  Substation: '\u{1F50C}',
  WaterTower: '\u{1F6B0}',
  Reservoir: '\u{1F4A7}',
  GasStation: '\u{26FD}',
  AutoShop: '\u{1F527}',
  Garage: '\u{1F697}',
  MallShop: '\u{1F6CD}\u{FE0F}',
  Supermarket: '\u{1F6D2}',
  OfficeTower: '\u{1F3E2}',
  Skyscraper: '\u{1F3E2}',
  Datacenter: '\u{1F5A5}\u{FE0F}',
  Studio: '\u{1F39E}\u{FE0F}',
  Spaceport: '\u{1F680}',
  OrbitalLift: '\u{1F6F0}\u{FE0F}',
  SolarArray: '\u{2600}\u{FE0F}',
  WindFarm: '\u{1F32C}\u{FE0F}',
  FusionPlant: '\u{2622}\u{FE0F}',
  NeuralHub: '\u{1F9E0}',
  AiCore: '\u{1F916}',
  Biodome: '\u{1F33F}',
  Cryolab: '\u{2744}\u{FE0F}',
  NanoFab: '\u{1F9EA}',
  Hyperloop: '\u{1F687}',
  Maglev: '\u{1F684}',
  Hospital2: '\u{1F3E5}',
  ResearchLab: '\u{1F52C}',
  Megastructure: '\u{1F30C}',
  Well: '\u{1F4A6}',
  Lamppost: '\u{1F4A1}',
  Signpost: '\u{1F6A9}',
  MarketStall: '\u{1F6D2}',
  FoodCart: '\u{1F32D}',
  Cart: '\u{1F6F4}',
  Tent: '\u{26FA}',
  Pavilion: '\u{1F3D4}\u{FE0F}',
  Gazebo: '\u{1F3DE}\u{FE0F}',
  Bench: '\u{1FA91}',
  Fence: '\u{1F9F1}',
  Gate: '\u{1F6AA}',
  Watchtower: '\u{1F5FC}',
  Gallows: '\u{1FAA2}',
  Monument: '\u{1F5FF}',
  Obelisk: '\u{1F5FF}',
  Shrine: '\u{26E9}\u{FE0F}',
  Cemetery: '\u{1FAA6}',
  GraveStone: '\u{1FAA6}',
  Garden: '\u{1F33C}',
  Orchard: '\u{1F34E}',
  Pond: '\u{1F315}',
  PlayGround: '\u{1F6DD}',
  FlagPole: '\u{1F6A9}',
  Bandstand: '\u{1F3BC}',
  Kiosk: '\u{1F6CD}\u{FE0F}',
  BillBoard: '\u{1F4F0}',
  TelephonePole: '\u{1F4DE}',
  StreetLight: '\u{1F4A1}',
  BusStop: '\u{1F68C}',
  ParkingLot: '\u{1F17F}\u{FE0F}',
  Crosswalk: '\u{1F6B6}',
  Pyramid: '\u{1F53A}',
  Ziggurat: '\u{1F53A}',
  Coliseum: '\u{1F3DF}\u{FE0F}',
  TriumphalArch: '\u{1F309}',
  ClockTower: '\u{1F570}\u{FE0F}',
  Mosque: '\u{1F54C}',
  Synagogue: '\u{1F54D}',
  Pagoda: '\u{1F5FE}',
  Stupa: '\u{1F54B}',
  Mausoleum: '\u{1FAA6}',
  Hangar: '\u{1F6E9}\u{FE0F}',
  Silo: '\u{1F33E}',
  Warehouse: '\u{1F4E6}',
  Dock: '\u{1F6A2}',
  Marina: '\u{26F5}',
  Lighthouse2: '\u{1F5FC}',
  Drydock: '\u{2693}',
  Crane: '\u{1F3D7}\u{FE0F}',
  RadioTower: '\u{1F4E1}',
  SatelliteDish: '\u{1F4E1}',
  WindTurbine: '\u{1F32C}\u{FE0F}',
  SolarPanel: '\u{2600}\u{FE0F}',
  ChargingStation: '\u{1F50C}',
  RoboticArm: '\u{1F9BE}',
  Drone: '\u{1F6F8}',
  HoloBoard: '\u{1F4FA}',
  NeonSign: '\u{1F4A1}',
  ArcadeBox: '\u{1F579}\u{FE0F}',
  Fountain2: '\u{26F2}',
  FoodTruck: '\u{1F69A}',
  Greenhouse2: '\u{1F9EA}',
  MushroomFarm: '\u{1F344}',
  Aquaculture: '\u{1F420}',
}

const FOOTPRINTS: Record<string, [number, number]> = {
  Hut: [2, 2],
  House: [3, 3],
  Manor: [5, 5],
  TownHouse: [3, 4],
  Apartment: [5, 5],
  School: [5, 4],
  University: [6, 5],
  Library: [4, 3],
  Market: [4, 3],
  Temple: [5, 5],
  Factory: [6, 4],
  Hospital: [5, 4],
  Forge: [3, 3],
  Mill: [3, 3],
  Bakery: [3, 2],
  Inn: [3, 3],
  Bank: [4, 3],
  Workshop: [3, 2],
  Granary: [3, 3],
  Barracks: [4, 3],
  Lighthouse: [2, 3],
  Windmill: [3, 3],
  Watermill: [3, 3],
  Aqueduct: [5, 1],
  Bridge: [4, 1],
  Wall: [1, 1],
  Tower: [2, 2],
  Plaza: [4, 4],
  Statue: [1, 1],
  TrainStation: [5, 4],
  Airport: [6, 6],
  Port: [5, 4],
  Stadium: [6, 6],
  Museum: [5, 4],
  Cathedral: [6, 6],
  Castle: [6, 6],
  Theatre: [5, 4],
  Observatory: [3, 3],
  Tavern: [3, 3],
  Brewery: [3, 3],
  Butcher: [2, 2],
  Fishmonger: [2, 2],
  Cheesemonger: [2, 2],
  Tailor: [2, 2],
  Cobbler: [2, 2],
  ClothingShop: [3, 2],
  Jeweler: [2, 2],
  Apothecary: [2, 2],
  Herbalist: [2, 2],
  Barbershop: [2, 2],
  Scribe: [2, 2],
  BookStore: [2, 2],
  ArtGallery: [3, 3],
  MusicHall: [4, 3],
  Cafe: [2, 2],
  Restaurant: [3, 2],
  Hotel: [4, 3],
  GuildHall: [3, 3],
  Courthouse: [4, 3],
  CityHall: [4, 3],
  PostOffice: [2, 2],
  PoliceStation: [3, 2],
  FireStation: [3, 2],
  Pharmacy: [2, 2],
  Clinic: [2, 2],
  Spa: [3, 2],
  Bathhouse: [3, 3],
  Greenhouse: [3, 3],
  Vineyard: [3, 3],
  Ranch: [4, 4],
  Stable: [3, 2],
  Kennel: [2, 2],
  Dovecote: [1, 1],
  Quarry: [3, 3],
  Mine: [2, 2],
  SawMill: [3, 3],
  Tannery: [3, 2],
  Smithy: [2, 2],
  Goldsmith: [2, 2],
  Refinery: [4, 4],
  PowerPlant: [4, 4],
  Substation: [2, 2],
  WaterTower: [2, 2],
  Reservoir: [4, 4],
  GasStation: [3, 2],
  AutoShop: [3, 2],
  Garage: [2, 2],
  MallShop: [4, 4],
  Supermarket: [4, 3],
  OfficeTower: [3, 3],
  Skyscraper: [4, 4],
  Datacenter: [4, 3],
  Studio: [3, 2],
  Spaceport: [6, 6],
  OrbitalLift: [3, 3],
  SolarArray: [5, 5],
  WindFarm: [5, 5],
  FusionPlant: [4, 4],
  NeuralHub: [4, 3],
  AiCore: [3, 3],
  Biodome: [5, 5],
  Cryolab: [3, 3],
  NanoFab: [3, 3],
  Hyperloop: [6, 1],
  Maglev: [6, 1],
  Hospital2: [5, 5],
  ResearchLab: [4, 3],
  Megastructure: [8, 8],
  Well: [1, 1],
  Lamppost: [1, 1],
  Signpost: [1, 1],
  MarketStall: [1, 1],
  FoodCart: [1, 1],
  Cart: [1, 1],
  Tent: [1, 1],
  Pavilion: [3, 3],
  Gazebo: [2, 2],
  Bench: [1, 1],
  Fence: [1, 1],
  Gate: [1, 1],
  Watchtower: [2, 2],
  Gallows: [1, 1],
  Monument: [2, 2],
  Obelisk: [1, 1],
  Shrine: [1, 1],
  Cemetery: [3, 3],
  GraveStone: [1, 1],
  Garden: [3, 3],
  Orchard: [3, 3],
  Pond: [2, 2],
  PlayGround: [3, 3],
  FlagPole: [1, 1],
  Bandstand: [2, 2],
  Kiosk: [1, 1],
  BillBoard: [1, 1],
  TelephonePole: [1, 1],
  StreetLight: [1, 1],
  BusStop: [1, 1],
  ParkingLot: [3, 3],
  Crosswalk: [1, 1],
  Pyramid: [5, 5],
  Ziggurat: [5, 5],
  Coliseum: [5, 5],
  TriumphalArch: [2, 1],
  ClockTower: [2, 2],
  Mosque: [4, 4],
  Synagogue: [3, 3],
  Pagoda: [3, 3],
  Stupa: [2, 2],
  Mausoleum: [2, 2],
  Hangar: [4, 3],
  Silo: [2, 2],
  Warehouse: [4, 3],
  Dock: [3, 2],
  Marina: [4, 3],
  Lighthouse2: [2, 3],
  Drydock: [4, 3],
  Crane: [2, 2],
  RadioTower: [2, 2],
  SatelliteDish: [1, 1],
  WindTurbine: [2, 2],
  SolarPanel: [1, 1],
  ChargingStation: [1, 1],
  RoboticArm: [1, 1],
  Drone: [1, 1],
  HoloBoard: [1, 1],
  NeonSign: [1, 1],
  ArcadeBox: [1, 1],
  Fountain2: [2, 2],
  FoodTruck: [2, 1],
  Greenhouse2: [3, 3],
  MushroomFarm: [3, 3],
  Aquaculture: [3, 3],
}

function normKind(kind: string): string {
  return kind
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, (_, c) => c.toUpperCase())
}

export function buildingFootprint(kind: string): [number, number] {
  const k = FOOTPRINTS[kind] ?? FOOTPRINTS[normKind(kind)]
  return k ?? [1, 1]
}

function positiveTileSpan(value: number | undefined, fallback: number): number {
  const resolved = Number.isFinite(value) ? (value as number) : fallback
  return Math.max(1, Math.floor(resolved))
}

export function buildingEmoji(kind: string): string {
  return BUILDING_EMOJI[kind] ?? BUILDING_EMOJI[normKind(kind)] ?? '\u{1F3DA}\u{FE0F}'
}

export type BuildingLike = Pick<
  Building,
  | 'id'
  | 'kind'
  | 'x'
  | 'y'
  | 'footprint'
  | 'fw'
  | 'fh'
  | 'condition'
  | 'damage'
  | 'integrity'
  | 'ruined'
  | 'repairing'
>

/**
 * Uses the footprint supplied by the simulation whenever possible. The local
 * kind table only exists for legacy snapshots that predate serialized sizes.
 */
export function resolveBuildingFootprint(
  building: Pick<BuildingLike, 'kind' | 'footprint' | 'fw' | 'fh'>,
): [number, number] {
  const fallback = buildingFootprint(building.kind)
  if (building.footprint) {
    return [
      positiveTileSpan(building.footprint[0], fallback[0]),
      positiveTileSpan(building.footprint[1], fallback[1]),
    ]
  }
  if (building.fw !== undefined || building.fh !== undefined) {
    return [positiveTileSpan(building.fw, fallback[0]), positiveTileSpan(building.fh, fallback[1])]
  }
  return [positiveTileSpan(fallback[0], 1), positiveTileSpan(fallback[1], 1)]
}

/** Bottom edge used for painter-style depth sorting. */
export function buildingDepthKey(building: BuildingLike): number {
  const [, height] = resolveBuildingFootprint(building)
  return (Number.isFinite(building.y) ? building.y : 0) + height
}

/** Stable bottom-edge ordering for buildings that share a depth row. */
export function compareBuildingsByDepth(a: BuildingLike, b: BuildingLike): number {
  return (
    buildingDepthKey(a) - buildingDepthKey(b) ||
    (Number.isFinite(a.x) ? a.x : 0) - (Number.isFinite(b.x) ? b.x : 0) ||
    a.id - b.id
  )
}

export type BuildingVisualDetail = 'overview' | 'standard' | 'detail'

const WALL_COLORS: Record<string, string> = {
  Hut: '#8a6a44',
  House: '#a6845a',
  Manor: '#c4a070',
  TownHouse: '#b08868',
  Apartment: '#8c8c92',
  School: '#d6c39a',
  University: '#e0cca0',
  Library: '#b89868',
  Market: '#c88030',
  Temple: '#d8b860',
  Factory: '#6a6a6a',
  Hospital: '#e8e8e8',
  Forge: '#5a4030',
  Mill: '#a07854',
  Bakery: '#c89060',
  Inn: '#9a7048',
  Bank: '#b8a878',
  Workshop: '#8a6a48',
  Granary: '#b88848',
  Barracks: '#5a5a5a',
  Lighthouse: '#e8e0d0',
  Windmill: '#a07854',
  Watermill: '#a07854',
  Aqueduct: '#8a8a8a',
  Bridge: '#8a8a8a',
  Wall: '#7a7268',
  Tower: '#4a4a4a',
  Plaza: '#a89880',
  Statue: '#b0b0b0',
  Tavern: '#7a4a28',
  Brewery: '#7a4a28',
  Butcher: '#a04848',
  Fishmonger: '#6890b0',
  Cheesemonger: '#e8c878',
  Tailor: '#9870a8',
  Cobbler: '#604030',
  ClothingShop: '#c870a0',
  Jeweler: '#a89060',
  Apothecary: '#608860',
  Herbalist: '#608848',
  Barbershop: '#c8c8c8',
  Scribe: '#c8b078',
  BookStore: '#684830',
  ArtGallery: '#a86880',
  MusicHall: '#5050a8',
  Cafe: '#704830',
  Restaurant: '#a87048',
  Hotel: '#c0a070',
  GuildHall: '#5878a8',
  Courthouse: '#a8a090',
  CityHall: '#b8a060',
  PostOffice: '#a05848',
  PoliceStation: '#3050a0',
  FireStation: '#c83020',
  Pharmacy: '#48a070',
  Clinic: '#e8e8e8',
  Spa: '#c8a0c0',
  Bathhouse: '#a0c0d8',
  Greenhouse: '#b0e0a0',
  Vineyard: '#80a060',
  Ranch: '#a87850',
  Stable: '#785030',
  Kennel: '#684838',
  Dovecote: '#a09078',
  Quarry: '#909090',
  Mine: '#605050',
  SawMill: '#a07848',
  Tannery: '#7a5838',
  Smithy: '#604030',
  Goldsmith: '#d8b048',
  Refinery: '#807868',
  PowerPlant: '#808080',
  Substation: '#a0a0a0',
  WaterTower: '#a8b0b8',
  Reservoir: '#5878a0',
  GasStation: '#d8a020',
  AutoShop: '#606060',
  Garage: '#707070',
  MallShop: '#a0a8b8',
  Supermarket: '#48a048',
  OfficeTower: '#88a0b8',
  Skyscraper: '#5070a0',
  Datacenter: '#202830',
  Studio: '#383848',
  Spaceport: '#a0a0c0',
  OrbitalLift: '#7080a0',
  SolarArray: '#2050a0',
  WindFarm: '#c8d8e8',
  FusionPlant: '#a020a0',
  NeuralHub: '#a050d0',
  AiCore: '#20c0d0',
  Biodome: '#80e090',
  Cryolab: '#c8e0f0',
  NanoFab: '#80a0c0',
  Hyperloop: '#404868',
  Maglev: '#506880',
  Hospital2: '#f0f0f0',
  ResearchLab: '#a8c0d8',
  Megastructure: '#404060',
  Well: '#807060',
  Lamppost: '#303030',
  Signpost: '#785030',
  MarketStall: '#c87840',
  FoodCart: '#a05030',
  Cart: '#604838',
  Tent: '#a89060',
  Pavilion: '#c8a878',
  Gazebo: '#a89878',
  Bench: '#5a3818',
  Fence: '#604838',
  Gate: '#604838',
  Watchtower: '#605040',
  Gallows: '#4a2a18',
  Monument: '#a8a098',
  Obelisk: '#888080',
  Shrine: '#c8a050',
  Cemetery: '#808080',
  GraveStone: '#909090',
  Garden: '#80b070',
  Orchard: '#608838',
  Pond: '#5078a0',
  PlayGround: '#d8a070',
  FlagPole: '#a8a8a8',
  Bandstand: '#a89070',
  Kiosk: '#a07050',
  BillBoard: '#b0b0b0',
  TelephonePole: '#604838',
  StreetLight: '#303030',
  BusStop: '#506888',
  ParkingLot: '#404040',
  Crosswalk: '#808080',
  Pyramid: '#c8a868',
  Ziggurat: '#a88858',
  Coliseum: '#a08868',
  TriumphalArch: '#a8a098',
  ClockTower: '#a09078',
  Mosque: '#a8b0c8',
  Synagogue: '#a0a8c0',
  Pagoda: '#a85040',
  Stupa: '#c8b878',
  Mausoleum: '#888080',
  Hangar: '#606060',
  Silo: '#a89858',
  Warehouse: '#706050',
  Dock: '#604838',
  Marina: '#5878a0',
  Lighthouse2: '#e0d8c8',
  Drydock: '#606870',
  Crane: '#a8a020',
  RadioTower: '#c84040',
  SatelliteDish: '#a0a0a0',
  WindTurbine: '#e0e0e0',
  SolarPanel: '#1030a0',
  ChargingStation: '#30c050',
  RoboticArm: '#a8a020',
  Drone: '#404048',
  HoloBoard: '#20a8d0',
  NeonSign: '#e020a0',
  ArcadeBox: '#3030c0',
  Fountain2: '#80a8c8',
  FoodTruck: '#c87030',
  Greenhouse2: '#c0e8b0',
  MushroomFarm: '#a06848',
  Aquaculture: '#3868a0',
  TrainStation: '#604030',
  Airport: '#a0a8c0',
  Port: '#5878a0',
  Stadium: '#a8a098',
  Museum: '#a8a088',
  Cathedral: '#c8b878',
  Castle: '#807868',
  Theatre: '#a05870',
  Observatory: '#a0a8b8',
}

const ROOF_COLORS: Record<string, string> = {
  Hut: '#4a3018',
  House: '#7a3a20',
  Manor: '#4a2018',
  TownHouse: '#5a2818',
  Apartment: '#3a3a3e',
  School: '#a83020',
  University: '#5a2818',
  Library: '#3a2818',
  Market: '#a06030',
  Temple: '#b88020',
  Factory: '#2a2a2a',
  Hospital: '#c83030',
  Forge: '#2a1a10',
  Mill: '#4a2818',
  Bakery: '#5a3018',
  Inn: '#5a2818',
  Bank: '#3a2a18',
  Workshop: '#4a3020',
  Granary: '#5a3818',
  Barracks: '#2a2a2a',
  Windmill: '#4a2818',
  Watermill: '#4a2818',
}

function wallColor(kind: string): string {
  return WALL_COLORS[kind] ?? WALL_COLORS[normKind(kind)] ?? '#8a7a5a'
}

function roofColor(kind: string): string | null {
  const c = ROOF_COLORS[kind] ?? ROOF_COLORS[normKind(kind)]
  return c ?? null
}

const HOUSE_LIKE = new Set([
  'Hut',
  'House',
  'Manor',
  'TownHouse',
  'School',
  'University',
  'Library',
  'Market',
  'Forge',
  'Mill',
  'Bakery',
  'Inn',
  'Bank',
  'Workshop',
  'Granary',
  'Barracks',
  'Hospital',
  'Windmill',
  'Watermill',
  'Tavern',
  'Brewery',
  'Butcher',
  'Fishmonger',
  'Cheesemonger',
  'Tailor',
  'Cobbler',
  'ClothingShop',
  'Jeweler',
  'Apothecary',
  'Herbalist',
  'Barbershop',
  'Scribe',
  'BookStore',
  'ArtGallery',
  'MusicHall',
  'Cafe',
  'Restaurant',
  'Hotel',
  'GuildHall',
  'Courthouse',
  'CityHall',
  'PostOffice',
  'PoliceStation',
  'FireStation',
  'Pharmacy',
  'Clinic',
  'Spa',
  'Bathhouse',
  'Greenhouse',
  'Vineyard',
  'Stable',
  'SawMill',
  'Tannery',
  'Smithy',
  'Goldsmith',
  'GasStation',
  'AutoShop',
  'Garage',
  'MallShop',
  'Supermarket',
  'OfficeTower',
  'Skyscraper',
  'Studio',
  'Datacenter',
  'Hospital2',
  'ResearchLab',
  'Hangar',
  'Warehouse',
  'Silo',
  'Pavilion',
  'Gazebo',
  'Bandstand',
  'Watchtower',
  'Pagoda',
  'Mosque',
  'Synagogue',
  'Stupa',
  'Mausoleum',
  'ClockTower',
  'Greenhouse2',
])

function isHouseLike(kind: string): boolean {
  return HOUSE_LIKE.has(kind) || HOUSE_LIKE.has(normKind(kind))
}

function visualHash(building: BuildingLike, salt: number): number {
  let value =
    Math.imul((building.id ?? 0) + salt * 101, 2654435761) ^
    Math.imul(Math.floor(building.x) + salt, 73856093) ^
    Math.imul(Math.floor(building.y) - salt, 19349663)
  value ^= value >>> 16
  return (value >>> 0) / 4294967295
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  size = 1,
) {
  let x = Math.round(fromX)
  let y = Math.round(fromY)
  const targetX = Math.round(toX)
  const targetY = Math.round(toY)
  const dx = Math.abs(targetX - x)
  const sx = x < targetX ? 1 : -1
  const dy = -Math.abs(targetY - y)
  const sy = y < targetY ? 1 : -1
  let error = dx + dy
  const pixelSize = Math.max(1, Math.round(size))
  const offset = Math.floor(pixelSize / 2)

  while (true) {
    ctx.fillStyle = color
    ctx.fillRect(x - offset, y - offset, pixelSize, pixelSize)
    if (x === targetX && y === targetY) break
    const twiceError = error * 2
    if (twiceError >= dy) {
      error += dy
      x += sx
    }
    if (twiceError <= dx) {
      error += dx
      y += sy
    }
  }
}

function drawBuildingShadow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
) {
  const x = Math.round(px)
  const y = Math.round(py + h)
  const width = Math.max(1, Math.round(w))
  const outerInset = Math.min(Math.floor(width / 4), Math.max(1, Math.round(tileSize * 0.12)))
  const innerInset = Math.min(Math.floor(width / 3), Math.max(2, Math.round(tileSize * 0.24)))

  // Three hard-edged bands read as a ground shadow without blurring adjacent
  // sprites or introducing sub-pixel filtering into the pixel-art layer.
  ctx.fillStyle = 'rgba(15, 11, 9, 0.18)'
  ctx.fillRect(x, y - 1, width, Math.max(2, Math.round(tileSize * 0.24)))
  ctx.fillStyle = 'rgba(15, 11, 9, 0.28)'
  ctx.fillRect(
    x + outerInset,
    y - 2,
    Math.max(1, width - outerInset * 2),
    Math.max(2, Math.round(tileSize * 0.18)),
  )
  ctx.fillStyle = 'rgba(15, 11, 9, 0.38)'
  ctx.fillRect(
    x + innerInset,
    y - 2,
    Math.max(1, width - innerInset * 2),
    Math.max(1, Math.round(tileSize * 0.1)),
  )
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  tileSize: number,
  progress: number,
  color: string,
) {
  const x = Math.round(px)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(tileSize * 0.18))
  const y = Math.round(py - Math.max(4, tileSize * 0.28))
  ctx.fillStyle = 'rgba(18, 12, 10, 0.9)'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = color
  ctx.fillRect(
    x + 1,
    y + 1,
    Math.max(0, Math.round((width - 2) * Math.max(0, Math.min(1, progress)))),
    Math.max(1, height - 2),
  )
}

function drawConstructionSite(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
) {
  const progress = Math.max(0, Math.min(1, state.constructionProgress))
  const x = Math.round(px)
  const y = Math.round(py)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(h))
  const groundY = y + height
  const foundationHeight = Math.max(2, Math.round(tileSize * 0.2))
  const foundationY = groundY - foundationHeight
  const foundationProgress = Math.min(1, Math.max(0.12, progress / 0.2))
  const foundationWidth = Math.max(2, Math.round(width * foundationProgress))
  const foundationX = x + Math.floor((width - foundationWidth) / 2)

  // Cleared earth and a foundation make even a zero-progress reservation
  // distinguishable from an operational building.
  ctx.fillStyle = '#493727'
  ctx.fillRect(
    x,
    groundY - Math.max(2, Math.round(tileSize * 0.3)),
    width,
    Math.max(2, Math.round(tileSize * 0.3)),
  )
  ctx.fillStyle = '#30251d'
  ctx.fillRect(foundationX - 1, foundationY - 1, foundationWidth + 2, foundationHeight + 2)
  ctx.fillStyle = '#807566'
  ctx.fillRect(foundationX, foundationY, foundationWidth, foundationHeight)
  ctx.fillStyle = '#a59a87'
  ctx.fillRect(foundationX, foundationY, foundationWidth, 1)

  // Material stacks remain visible through the early build and disappear as
  // the shell consumes them.
  if (progress < 0.62) {
    const stackWidth = Math.max(2, Math.min(5, Math.round(tileSize * 0.26)))
    const stackX = x + 1 + Math.round(visualHash(building, 31) * Math.max(0, width - stackWidth - 2))
    const stackY = groundY - foundationHeight - 2
    ctx.fillStyle = '#4a2f1d'
    ctx.fillRect(stackX, stackY, stackWidth, 2)
    ctx.fillStyle = '#b07943'
    ctx.fillRect(stackX, stackY - 1, stackWidth, 1)

    const stoneX = x + width - Math.max(3, Math.round(tileSize * 0.3))
    ctx.fillStyle = '#5c554d'
    ctx.fillRect(stoneX, groundY - foundationHeight - 2, 3, 2)
    ctx.fillStyle = '#81766a'
    ctx.fillRect(stoneX + 1, groundY - foundationHeight - 3, 2, 1)
  }

  if (progress >= 0.16) {
    const shellProgress = Math.min(1, (progress - 0.16) / 0.84)
    const maximumShellHeight = Math.max(4, height - foundationHeight)
    const shellHeight = Math.max(3, Math.round(maximumShellHeight * (0.18 + shellProgress * 0.82)))
    const shellTop = foundationY - shellHeight
    const frameColor = '#76502f'
    const highlight = '#a87945'

    // Unfinished masonry fills upward in discrete bands; exposed posts and
    // cross-braces keep it visibly under construction even at 99%.
    if (progress >= 0.36) {
      const wallInset = Math.max(2, Math.round(tileSize * 0.14))
      const wallTop = Math.round(
        foundationY - shellHeight * Math.min(0.9, Math.max(0.15, (progress - 0.28) / 0.72)),
      )
      ctx.fillStyle = '#756c5d'
      ctx.fillRect(
        x + wallInset,
        wallTop,
        Math.max(1, width - wallInset * 2),
        Math.max(1, foundationY - wallTop),
      )
      ctx.fillStyle = '#918676'
      for (let row = wallTop; row < foundationY; row += 4) {
        ctx.fillRect(x + wallInset, row, Math.max(1, width - wallInset * 2), 1)
      }
    }

    const postWidth = Math.max(1, Math.round(tileSize * 0.1))
    const postCount = Math.max(2, Math.min(5, Math.ceil(width / Math.max(8, tileSize))))
    for (let i = 0; i < postCount; i++) {
      const postX = Math.round(x + (i * (width - postWidth)) / Math.max(1, postCount - 1))
      ctx.fillStyle = frameColor
      ctx.fillRect(postX, shellTop, postWidth, foundationY - shellTop)
      ctx.fillStyle = highlight
      ctx.fillRect(postX, shellTop, 1, foundationY - shellTop)
    }

    const beamStep = Math.max(5, Math.round(tileSize * 0.42))
    for (let beamY = foundationY - 2; beamY >= shellTop; beamY -= beamStep) {
      ctx.fillStyle = frameColor
      ctx.fillRect(x, beamY, width, Math.max(1, postWidth))
    }
    drawPixelLine(ctx, x, foundationY - 1, x + width - 1, shellTop, '#5d3c25')
    drawPixelLine(ctx, x + width - 1, foundationY - 1, x, shellTop, '#5d3c25')

    if (progress >= 0.78) {
      const roofPeakY = Math.max(y, shellTop - Math.max(3, Math.round(tileSize * 0.28)))
      drawPixelLine(ctx, x - 1, shellTop, x + Math.floor(width / 2), roofPeakY, frameColor, postWidth)
      drawPixelLine(ctx, x + Math.floor(width / 2), roofPeakY, x + width, shellTop, frameColor, postWidth)
    }

    if (detail !== 'overview') {
      const scaffoldOffset = Math.max(2, Math.round(tileSize * 0.15))
      const scaffoldTop = Math.max(y, shellTop - 2)
      ctx.fillStyle = '#c99a52'
      ctx.fillRect(x - scaffoldOffset, scaffoldTop, 1, groundY - scaffoldTop)
      ctx.fillRect(x + width + scaffoldOffset - 1, scaffoldTop, 1, groundY - scaffoldTop)
      for (let row = groundY - 2; row >= scaffoldTop; row -= Math.max(5, Math.round(tileSize * 0.4))) {
        ctx.fillRect(x - scaffoldOffset, row, width + scaffoldOffset * 2, 1)
      }
    }
  }

  if (detail === 'detail') {
    drawProgressBar(ctx, px, py, w, tileSize, progress, '#e7b94f')
  }
}

function drawRuinedBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
) {
  ctx.save()

  const x = Math.round(px)
  const y = Math.round(py)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(h))
  const rubbleTop = y + Math.round(height * 0.48)
  const rubbleBottom = y + height

  // A stepped, soot-black footprint replaces the intact silhouette.
  ctx.fillStyle = 'rgba(24, 17, 14, 0.88)'
  ctx.fillRect(x, rubbleTop + 2, width, Math.max(1, rubbleBottom - rubbleTop - 2))
  ctx.fillRect(x + 1, rubbleTop + 1, Math.max(1, width - 2), Math.max(1, rubbleBottom - rubbleTop))
  ctx.fillStyle = 'rgba(44, 31, 25, 0.92)'
  ctx.fillRect(x + 2, rubbleTop, Math.max(1, width - 4), Math.max(1, rubbleBottom - rubbleTop - 1))

  const rubbleCount = Math.min(12, 5 + Math.ceil((w + h) / Math.max(1, tileSize)))
  const rubbleColors = ['#51443a', '#66584b', '#3b312b', '#796652']
  for (let i = 0; i < rubbleCount; i++) {
    const rx = visualHash(building, i * 3 + 1)
    const ry = visualHash(building, i * 3 + 2)
    const rs = visualHash(building, i * 3 + 3)
    const rw = Math.max(2, Math.round(tileSize * (0.18 + rs * 0.25)))
    const rh = Math.max(2, Math.round(tileSize * (0.12 + (1 - rs) * 0.18)))
    const rubbleX = x + Math.round(rx * Math.max(0, width - rw))
    const rubbleY = rubbleTop + Math.round(ry * Math.max(0, rubbleBottom - rubbleTop - rh))
    ctx.fillStyle = rubbleColors[i % rubbleColors.length]
    ctx.fillRect(rubbleX, rubbleY, rw, rh)
    ctx.fillStyle = i % 2 === 0 ? '#8b755e' : '#443831'
    ctx.fillRect(rubbleX, rubbleY, Math.max(1, rw - 1), 1)
  }

  drawPixelLine(ctx, x + width * 0.16, y + height * 0.32, x + width * 0.84, y + height * 0.82, '#2c1c16', 2)
  drawPixelLine(ctx, x + width * 0.8, y + height * 0.28, x + width * 0.2, y + height * 0.84, '#2c1c16', 2)

  if (state.isRepairing && detail !== 'overview') {
    const scaffoldTop = y + Math.max(2, Math.round(height * 0.12))
    const left = x + Math.max(1, Math.round(width * 0.18))
    const right = x + width - Math.max(2, Math.round(width * 0.18))
    ctx.fillStyle = '#efc76d'
    ctx.fillRect(left, scaffoldTop, 1, rubbleBottom - scaffoldTop)
    ctx.fillRect(right, scaffoldTop, 1, rubbleBottom - scaffoldTop)
    for (let row = scaffoldTop; row < rubbleBottom; row += Math.max(4, Math.round(tileSize * 0.35))) {
      ctx.fillRect(left, row, Math.max(1, right - left + 1), 1)
    }
  }

  if (detail !== 'overview') {
    const label = state.isRepairing ? 'REBUILDING' : 'RUIN'
    ctx.font = `bold ${Math.max(6, Math.min(9, tileSize * 0.5))}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(20, 12, 9, 0.95)'
    ctx.strokeText(label, x + width / 2, y + height * 0.4)
    ctx.fillStyle = state.isRepairing ? '#ffd77f' : '#ff725e'
    ctx.fillText(label, x + width / 2, y + height * 0.4)
  }
  ctx.restore()
}

function drawBuildingDamage(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
) {
  if (!state.isDamaged) return
  const severity = Math.max(state.damage, 1 - state.integrity)

  ctx.save()
  ctx.fillStyle = `rgba(30, 18, 13, ${0.1 + severity * 0.38})`
  ctx.fillRect(px, py, w, h)

  if (detail !== 'overview') {
    ctx.strokeStyle = severity > 0.55 ? '#2b1712' : '#493126'
    ctx.lineWidth = Math.max(1.2, tileSize * (0.055 + severity * 0.045))
    ctx.lineJoin = 'bevel'
    const crackX = px + w * (0.28 + visualHash(building, 71) * 0.4)
    ctx.beginPath()
    ctx.moveTo(crackX, py + h * 0.08)
    ctx.lineTo(crackX - w * 0.12, py + h * 0.34)
    ctx.lineTo(crackX + w * 0.08, py + h * 0.53)
    ctx.lineTo(crackX - w * 0.16, py + h * 0.82)
    ctx.moveTo(crackX - w * 0.05, py + h * 0.44)
    ctx.lineTo(crackX - w * 0.25, py + h * 0.58)
    ctx.stroke()
  }

  if (detail === 'detail') {
    drawProgressBar(
      ctx,
      px,
      py,
      w,
      tileSize,
      state.integrity,
      state.isRepairing ? '#eac05b' : severity > 0.55 ? '#f05b43' : '#e28d3f',
    )
  }

  if (state.isRepairing && detail !== 'overview') {
    ctx.strokeStyle = '#f4d47c'
    ctx.lineWidth = Math.max(1, tileSize * 0.07)
    ctx.setLineDash([Math.max(2, tileSize * 0.2), Math.max(1, tileSize * 0.1)])
    ctx.strokeRect(px - 1, py - 1, w + 2, h + 2)
  }
  ctx.restore()
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  ox: number,
  oy: number,
  tileSize: number,
  nightFactor = 0,
  detail: BuildingVisualDetail = 'standard',
) {
  const [fw, fh] = resolveBuildingFootprint(building)
  const px = (building.x - ox) * tileSize
  const py = (building.y - oy) * tileSize
  const w = fw * tileSize
  const h = fh * tileSize
  const cond = building.condition ?? 1
  const structural = getBuildingState(building)
  const k = normKind(building.kind)

  drawBuildingShadow(ctx, px, py, w, h, tileSize)

  if (structural.isRuined) {
    drawRuinedBuilding(ctx, building, structural, px, py, w, h, tileSize, detail)
    return
  }

  if (!structural.isComplete) {
    drawConstructionSite(ctx, building, structural, px, py, w, h, tileSize, detail)
    return
  }

  if (hasBuildingSprite(k)) {
    const variant =
      (((building.id ?? 0) * 2654435761) ^ (building.x * 73856093) ^ (building.y * 19349663)) >>> 0
    const nightBucket = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
    const condBucket = cond < 0.45 ? 0 : 1
    const sprite = getBuildingSprite(k, fw, fh, tileSize, variant & 7, nightBucket, condBucket)
    if (sprite) {
      ctx.drawImage(sprite, Math.round(px - PAD), Math.round(py + h + PAD_BOT - sprite.height))
      drawBuildingDamage(ctx, building, structural, px, py, w, h, tileSize, detail)
      return
    }
  }

  if (isHouseLike(k)) {
    const wallH = h * 0.62
    const roofH = h * 0.42
    const wallY = py + h - wallH
    const wall = wallColor(k)
    const roof = roofColor(k) ?? '#5a2818'

    const foundH = Math.max(2, tileSize * 0.18)
    const foundOver = Math.max(1, tileSize * 0.1)
    ctx.fillStyle = 'rgba(28,22,16,0.85)'
    ctx.fillRect(px - foundOver, py + h - foundH, w + foundOver * 2, foundH + foundOver)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(px - foundOver, py + h + foundOver - 1, w + foundOver * 2, 1)

    ctx.fillStyle = wall
    ctx.fillRect(px, wallY, w, wallH)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(px, wallY, w, Math.max(2, wallH * 0.1))
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(px, py + h - Math.max(2, wallH * 0.14), w, Math.max(2, wallH * 0.14))

    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(px - tileSize * 0.18, wallY)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w / 2, wallY - roofH)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath()
    ctx.moveTo(px + w / 2, wallY - roofH)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w * 0.62, wallY)
    ctx.closePath()
    ctx.fill()

    const doorW = Math.max(3, tileSize * 0.5)
    const doorH = Math.max(4, wallH * 0.55)
    ctx.fillStyle = '#2a1a10'
    ctx.fillRect(px + w / 2 - doorW / 2, py + h - doorH, doorW, doorH)
    ctx.fillStyle = '#d8c060'
    ctx.fillRect(px + w / 2 + doorW / 2 - 2, py + h - doorH / 2 - 1, 1.5, 1.5)

    const cols = Math.max(1, fw)
    const rows = Math.max(1, Math.floor(wallH / Math.max(6, tileSize * 0.5)))
    const winSize = Math.max(2, tileSize * 0.28)
    const winGapX = w / (cols + 1)
    const winGapY = wallH / (rows + 1)
    ctx.fillStyle = `rgba(220,230,255,${0.55 + cond * 0.3})`
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const wx = px + c * winGapX - winSize / 2
        const wy = wallY + r * winGapY - winSize / 2
        if (Math.abs(wx + winSize / 2 - (px + w / 2)) < doorW / 2 + 2 && wy + winSize > py + h - doorH)
          continue
        ctx.fillRect(wx, wy, winSize, winSize)
      }
    }
    ctx.strokeStyle = `rgba(0,0,0,${0.3})`
    ctx.lineWidth = 1
    ctx.strokeRect(px + 0.5, wallY + 0.5, w - 1, wallH - 1)
    const emoji = buildingEmoji(building.kind)
    const fontPx = Math.max(8, Math.min(w, h) * 0.32)
    ctx.save()
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.85
    ctx.fillText(emoji, px + w / 2, py + h * 0.18)
    ctx.restore()
  } else {
    const baseH = Math.max(3, tileSize * 0.32)
    const baseY = py + h - baseH
    const baseInset = Math.max(1, tileSize * 0.12)
    ctx.fillStyle = 'rgba(72, 56, 42, 0.85)'
    ctx.fillRect(px + baseInset, baseY, w - baseInset * 2, baseH)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(px + baseInset, baseY, w - baseInset * 2, Math.max(1, baseH * 0.18))
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.fillRect(px + baseInset, baseY + baseH - 1, w - baseInset * 2, 1)

    const emoji = buildingEmoji(building.kind)
    const fontPx = Math.max(10, Math.min(w, h) * 0.62)
    ctx.save()
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.globalAlpha = 0.95
    ctx.fillText(emoji, px + w / 2, baseY + 1)
    ctx.restore()
  }
  drawBuildingDamage(ctx, building, structural, px, py, w, h, tileSize, detail)
}
