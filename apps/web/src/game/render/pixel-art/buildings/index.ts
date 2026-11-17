import type { Art } from '../art.ts'
import type { Look } from './kit.ts'
import { home } from './homes.ts'
import { longhouse, tent } from './homes-early.ts'
import * as props from './props.ts'
import { bathhouse, hall, hotel, inn, kennel, shop, theatre } from './trades.ts'
import * as civic from './civic.ts'
import * as faith from './faith.ts'
import * as towers from './towers.ts'
import * as industry from './industry.ts'
import * as farm from './farm.ts'
import * as landmarks from './landmarks.ts'
import * as modern from './modern.ts'

/** A drawn building: every kind is a function from how it looks to its finished, outlined sprite. */
type Draw = (look: Look) => Art

export const DRAWN: Record<string, Draw> = {}

function reg(draw: Draw, ...kinds: string[]) {
  for (const k of kinds) DRAWN[k] = draw
}

reg(home, 'Hut', 'House', 'Manor', 'TownHouse', 'Apartment', 'Skyscraper')
reg(tent, 'Tent')
reg(longhouse, 'Longhouse')

reg(props.well, 'Well')
reg(props.lamppost, 'Lamppost')
reg(props.streetLight, 'StreetLight')
reg(props.marketStall, 'MarketStall')
reg(props.foodCart, 'FoodCart')
reg(props.kiosk, 'Kiosk')
reg(props.graveStone, 'GraveStone')
reg(props.shrine, 'Shrine')
reg(props.flagPole, 'FlagPole')
reg(props.fountain, 'Fountain')
reg(props.grandFountain, 'Fountain2')
reg(props.bench, 'Bench')
reg(props.signpost, 'Signpost')
reg(props.cart, 'Cart')
reg(props.fence, 'Fence')
reg(props.gallows, 'Gallows')
reg(props.billBoard, 'BillBoard')
reg(props.telephonePole, 'TelephonePole')
reg(props.satelliteDish, 'SatelliteDish')
reg(props.roboticArm, 'RoboticArm')
reg(props.drone, 'Drone')
reg(props.holoBoard, 'HoloBoard')
reg(props.neonSign, 'NeonSign')
reg(props.arcadeBox, 'ArcadeBox')
reg(props.chargingStation, 'ChargingStation')
reg(props.solarPanel, 'SolarPanel')
reg(props.busStop, 'BusStop')
reg(props.dovecote, 'Dovecote')
reg(props.crosswalk, 'Crosswalk')
reg(props.foodTruck, 'FoodTruck')
reg(props.substation, 'Substation')
reg(props.crane, 'Crane')
reg(props.pavilion, 'Pavilion', 'Gazebo', 'Bandstand')

reg(
  shop,
  'Bakery',
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
  'Cafe',
  'Restaurant',
  'PostOffice',
  'Goldsmith',
  'Pharmacy',
  'Clinic',
  'Spa',
  'Supermarket',
  'MallShop',
)
reg(inn, 'Tavern', 'Inn', 'Brewery')
reg(bathhouse, 'Bathhouse')
reg(hotel, 'Hotel')
reg(hall, 'GuildHall', 'ArtGallery', 'MusicHall')
reg(theatre, 'Theatre')
reg(kennel, 'Kennel')

reg(civic.bank, 'Bank')
reg(civic.courthouse, 'Courthouse')
reg(civic.cityHall, 'CityHall')
reg(civic.library, 'Library')
reg(civic.museum, 'Museum')
reg(civic.school, 'School')
reg(civic.university, 'University')
reg(civic.stadium, 'Stadium')
reg(civic.trainStation, 'TrainStation')
reg(civic.policeStation, 'PoliceStation')
reg(civic.fireStation, 'FireStation')

reg(faith.temple, 'Temple')
reg(faith.cathedral, 'Cathedral')
reg(faith.mosque, 'Mosque')
reg(faith.synagogue, 'Synagogue')
reg(faith.pagoda, 'Pagoda')
reg(faith.stupa, 'Stupa')
reg(faith.mausoleum, 'Mausoleum')

reg(towers.castle, 'Castle')
reg(towers.barracks, 'Barracks')
reg(towers.watchtower, 'Watchtower')
reg(towers.townWall, 'Wall')
reg(towers.gate, 'Gate')
reg(towers.tower, 'Tower')
reg(towers.lighthouse, 'Lighthouse', 'Lighthouse2')
reg(towers.clockTower, 'ClockTower')
reg(towers.observatory, 'Observatory')
reg(towers.waterTower, 'WaterTower')
reg(towers.radioTower, 'RadioTower')
reg(towers.windmill, 'Windmill', 'Mill')
reg(towers.watermill, 'Watermill')

reg(industry.factory, 'Factory')
reg(industry.forge, 'Forge')
reg(industry.smithy, 'Smithy')
reg(industry.sawMill, 'SawMill')
reg(industry.tannery, 'Tannery')
reg(industry.refinery, 'Refinery')
reg(industry.powerPlant, 'PowerPlant')
reg(industry.warehouse, 'Warehouse')
reg(industry.hangar, 'Hangar')
reg(industry.mine, 'Mine')
reg(industry.quarry, 'Quarry')
reg(industry.garage, 'Garage', 'AutoShop')
reg(industry.drydock, 'Drydock')
reg(industry.shipyard, 'Shipyard')
reg(industry.workshop, 'Workshop')

reg(farm.silo, 'Silo')
reg(farm.barn, 'Barn')
reg(farm.stable, 'Stable')
reg(farm.ranch, 'Ranch')
reg(farm.greenhouse, 'Greenhouse', 'Greenhouse2')
reg(farm.vineyard, 'Vineyard')
reg(farm.orchard, 'Orchard')
reg(farm.garden, 'Garden')
reg(farm.mushroomFarm, 'MushroomFarm')
reg(farm.pen, 'Pen')
reg(farm.granary, 'Granary')
reg(farm.market, 'Market')

reg(landmarks.pyramid, 'Pyramid')
reg(landmarks.ziggurat, 'Ziggurat')
reg(landmarks.coliseum, 'Coliseum')
reg(landmarks.triumphalArch, 'TriumphalArch')
reg(landmarks.obelisk, 'Obelisk')
reg(landmarks.monument, 'Monument')
reg(landmarks.statue, 'Statue')
reg(landmarks.plaza, 'Plaza')
reg(landmarks.pond, 'Pond')
reg(landmarks.reservoir, 'Reservoir')
reg(landmarks.cemetery, 'Cemetery')
reg(landmarks.playGround, 'PlayGround')
reg(landmarks.aquaculture, 'Aquaculture')
reg(landmarks.parkingLot, 'ParkingLot')
reg(landmarks.solarArray, 'SolarArray')
reg(landmarks.aqueduct, 'Aqueduct')
reg(landmarks.bridge, 'Bridge')
reg(landmarks.harbour, 'Dock', 'Marina', 'Port')

reg(modern.hospital, 'Hospital', 'Hospital2')
reg(modern.datacenter, 'Datacenter')
reg(modern.researchLab, 'ResearchLab')
reg(modern.studio, 'Studio')
reg(modern.airport, 'Airport')
reg(modern.gasStation, 'GasStation')
reg(modern.officeTower, 'OfficeTower')
reg(modern.spaceport, 'Spaceport')
reg(modern.orbitalLift, 'OrbitalLift')
reg(modern.fusionPlant, 'FusionPlant')
reg(modern.neuralHub, 'NeuralHub')
reg(modern.aiCore, 'AiCore')
reg(modern.biodome, 'Biodome')
reg(modern.cryolab, 'Cryolab')
reg(modern.nanoFab, 'NanoFab')
reg(modern.windTurbine, 'WindTurbine', 'WindFarm')
reg(modern.transitLine, 'Hyperloop', 'Maglev')
reg(modern.megastructure, 'Megastructure')

/** Things that lie on the ground (paving, water, plots, decks): they have no height, so they cast no shadow. */
export const FLAT: ReadonlySet<string> = new Set([
  'Plaza',
  'Pond',
  'Reservoir',
  'Garden',
  'Aquaculture',
  'MushroomFarm',
  'Cemetery',
  'ParkingLot',
  'Crosswalk',
  'Pen',
  'Bridge',
  'Dock',
  'Port',
  'Marina',
  'Fence',
  'Bench',
  'Vineyard',
  'Orchard',
  'Market',
  'PlayGround',
  'SolarArray',
])

/** The sprite of a building, or null for a kind with no drawing. */
export function drawBuildingArt(look: Look): Art | null {
  const draw = DRAWN[look.kind]
  return draw ? draw(look) : null
}

export type { Look }
