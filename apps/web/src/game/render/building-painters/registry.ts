import type { P } from './kit'
import {
  paintCottage,
  paintDwelling,
  paintEarlyHome,
  paintHut,
  paintManor,
  paintTent,
  paintTownhouse,
} from './dwellings'
import { paintCastle, paintFortress, paintTemple, paintTowerTall, paintWindmill } from './civic'
import { paintFarm, paintIndustrial, paintUtility } from './industry'
import { paintLandmark, paintProp } from './landmarks'
import { paintCrossing, paintLandscape } from './landscape'
import {
  paintFusionPlant,
  paintFuturistic,
  paintModern,
  paintOrbitalLift,
  paintPowerPlant,
  paintSpaceport,
} from './modern'
import { paintGlassTower } from './home-forms'
import { paintEraHome } from './era-home'
import { paintWorkshop } from './workshop'
import { paintPen } from './pasture'
import { CRAFT_SIGNS, paintCraftHome } from './craft-signs'
import { paintBarn, paintWatermill } from './farm-buildings'

export const ARCHETYPE: Record<string, (p: P) => void | boolean> = {}

function reg(painter: (p: P) => void | boolean, kinds: string[]) {
  for (const k of kinds) ARCHETYPE[k] = painter
}

reg(paintHut, ['Hut', 'Dovecote'])
reg(paintTent, ['Tent', 'Pavilion', 'Gazebo', 'Bandstand'])
reg(paintCottage, ['House'])
// Trades keep a cottage body but show their sign on the shop window (craft-signs.ts).
reg(paintCraftHome, Object.keys(CRAFT_SIGNS))
reg(
  (p) => paintTownhouse(p, false),
  [
    'TownHouse',
    'Hotel',
    'BookStore',
    'Scribe',
    'Tailor',
    'Barbershop',
    'PostOffice',
    'GuildHall',
    'ArtGallery',
    'MusicHall',
    'Theatre',
  ],
)
reg(
  (p) => paintTownhouse(p, true),
  [
    'Market',
    'Butcher',
    'Fishmonger',
    'Cheesemonger',
    'ClothingShop',
    'Jeweler',
    'Apothecary',
    'Cafe',
    'Restaurant',
    'Pharmacy',
    'MallShop',
    'Supermarket',
    'BusStop',
  ],
)
reg(paintManor, [
  'Manor',
  'School',
  'University',
  'Library',
  'Bank',
  'Courthouse',
  'CityHall',
  'Museum',
  'Stadium',
  'TrainStation',
])
reg(paintTemple, ['Temple', 'Cathedral', 'Mosque', 'Synagogue', 'Pagoda', 'Stupa', 'Mausoleum'])
reg(paintCastle, ['Castle', 'Barracks', 'Watchtower', 'Tower', 'Wall', 'Gate', 'PoliceStation'])
reg(paintTowerTall, ['Lighthouse', 'Lighthouse2', 'ClockTower', 'Observatory', 'WaterTower', 'RadioTower'])
reg(paintWindmill, ['Windmill'])
reg(paintWatermill, ['Watermill'])
reg(paintIndustrial, [
  'Factory',
  'Forge',
  'Smithy',
  'SawMill',
  'Tannery',
  'Refinery',
  'PowerPlant',
  'Warehouse',
  'Hangar',
  'Mine',
  'Quarry',
  'Goldsmith',
  'AutoShop',
  'Garage',
  'FireStation',
  'Drydock',
])
reg(paintFarm, ['Granary', 'Silo', 'Stable', 'Ranch', 'Greenhouse', 'Greenhouse2', 'Vineyard', 'Orchard'])
reg(paintPen, ['Pen'])
reg(paintBarn, ['Barn'])
reg(paintModern, [
  'Apartment',
  'OfficeTower',
  'Skyscraper',
  'Hospital',
  'Hospital2',
  'Clinic',
  'Datacenter',
  'ResearchLab',
  'Studio',
  'Airport',
  'GasStation',
])
reg(paintFuturistic, [
  'Spaceport',
  'OrbitalLift',
  'FusionPlant',
  'NeuralHub',
  'AiCore',
  'Biodome',
  'Cryolab',
  'NanoFab',
  'SolarArray',
  'SolarPanel',
  'WindFarm',
  'WindTurbine',
  'ChargingStation',
])
reg(paintLandmark, ['Pyramid', 'Ziggurat', 'Coliseum', 'TriumphalArch', 'Obelisk', 'Monument', 'Statue'])
reg(paintProp, [
  'Well',
  'Lamppost',
  'StreetLight',
  'MarketStall',
  'FoodCart',
  'Kiosk',
  'GraveStone',
  'Shrine',
  'FlagPole',
  'Fountain2',
  'Bench',
  'Signpost',
  'Cart',
  'Fence',
])

reg(paintDwelling, ['House'])
reg(paintWorkshop, ['Workshop'])
reg(paintEarlyHome, ['Hut'])
reg(paintFortress, ['Castle'])

reg(paintLandscape, [
  'Plaza',
  'Fountain',
  'Reservoir',
  'Cemetery',
  'Garden',
  'Pond',
  'PlayGround',
  'MushroomFarm',
  'Aquaculture',
])
reg(paintCrossing, ['Aqueduct', 'Bridge', 'Port', 'Dock', 'Marina'])
reg(paintFuturistic, ['Hyperloop', 'Maglev', 'Megastructure'])
reg(paintUtility, [
  'Substation',
  'Gallows',
  'BillBoard',
  'TelephonePole',
  'ParkingLot',
  'Crosswalk',
  'Crane',
  'SatelliteDish',
  'RoboticArm',
  'Drone',
  'HoloBoard',
  'NeonSign',
  'ArcadeBox',
  'FoodTruck',
])

// Homes follow their tribe's era; these landmarks get their own art.
reg(paintEraHome, ['Hut', 'House', 'Manor', 'TownHouse', 'Apartment', 'Skyscraper'])
reg(paintPowerPlant, ['PowerPlant'])
reg(paintSpaceport, ['Spaceport'])
reg(paintFusionPlant, ['FusionPlant'])
reg(paintOrbitalLift, ['OrbitalLift'])
reg(paintGlassTower, ['OfficeTower'])

export const BUILDING_SPRITE_KINDS = Object.freeze(Object.keys(ARCHETYPE))

export function hasBuildingSprite(kind: string): boolean {
  return kind in ARCHETYPE
}
