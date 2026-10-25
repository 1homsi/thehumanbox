// Words for the ids the simulation sends that the interface shows as plain words:
// moon phases, seasons and building kinds. Each id the table knows maps to a
// translation key. An id it does not know is shown as itself with underscores
// turned into spaces, so a new id from the simulation never breaks the interface.

import { hasMessage, t, type MessageKey } from '../i18n'

const MOON_PHASES = new Map<string, MessageKey>([
  ['new_moon', 'model.words.moon.newMoon'],
  ['waxing_crescent', 'model.words.moon.waxingCrescent'],
  ['first_quarter', 'model.words.moon.firstQuarter'],
  ['waxing_gibbous', 'model.words.moon.waxingGibbous'],
  ['full_moon', 'model.words.moon.fullMoon'],
  ['waning_gibbous', 'model.words.moon.waningGibbous'],
  ['last_quarter', 'model.words.moon.lastQuarter'],
  ['waning_crescent', 'model.words.moon.waningCrescent'],
])

const SEASONS = new Map<string, MessageKey>([
  ['abundance', 'model.words.season.abundance'],
  ['decline', 'model.words.season.decline'],
  ['scarcity', 'model.words.season.scarcity'],
  ['recovery', 'model.words.season.recovery'],
])

const BUILDING_KINDS = new Map<string, MessageKey>([
  ['hut', 'model.words.building.hut'],
  ['house', 'model.words.building.house'],
  ['manor', 'model.words.building.manor'],
  ['townhouse', 'model.words.building.townhouse'],
  ['apartment', 'model.words.building.apartment'],
  ['longhouse', 'model.words.building.longhouse'],
  ['well', 'model.words.building.well'],
  ['dock', 'model.words.building.dock'],
  ['marina', 'model.words.building.marina'],
  ['port', 'model.words.building.port'],
  ['shipyard', 'model.words.building.shipyard'],
  ['drydock', 'model.words.building.drydock'],
  ['saw_mill', 'model.words.building.sawMill'],
  ['quarry', 'model.words.building.quarry'],
  ['mine', 'model.words.building.mine'],
  ['smithy', 'model.words.building.smithy'],
  ['forge', 'model.words.building.forge'],
  ['mill', 'model.words.building.mill'],
  ['windmill', 'model.words.building.windmill'],
  ['watermill', 'model.words.building.watermill'],
  ['granary', 'model.words.building.granary'],
  ['silo', 'model.words.building.silo'],
  ['barn', 'model.words.building.barn'],
  ['pen', 'model.words.building.pen'],
  ['workshop', 'model.words.building.workshop'],
  ['warehouse', 'model.words.building.warehouse'],
  ['market', 'model.words.building.market'],
  ['market_stall', 'model.words.building.marketStall'],
  ['food_cart', 'model.words.building.foodCart'],
  ['tent', 'model.words.building.tent'],
  ['temple', 'model.words.building.temple'],
  ['shrine', 'model.words.building.shrine'],
  ['school', 'model.words.building.school'],
  ['library', 'model.words.building.library'],
  ['tavern', 'model.words.building.tavern'],
  ['inn', 'model.words.building.inn'],
  ['bakery', 'model.words.building.bakery'],
  ['brewery', 'model.words.building.brewery'],
  ['bridge', 'model.words.building.bridge'],
  ['wall', 'model.words.building.wall'],
  ['watchtower', 'model.words.building.watchtower'],
  ['barracks', 'model.words.building.barracks'],
  ['bank', 'model.words.building.bank'],
  ['stable', 'model.words.building.stable'],
  ['garden', 'model.words.building.garden'],
  ['university', 'model.words.building.university'],
  ['factory', 'model.words.building.factory'],
  ['hospital', 'model.words.building.hospital'],
  ['lighthouse', 'model.words.building.lighthouse'],
  ['aqueduct', 'model.words.building.aqueduct'],
  ['tower', 'model.words.building.tower'],
  ['plaza', 'model.words.building.plaza'],
  ['statue', 'model.words.building.statue'],
  ['fountain', 'model.words.building.fountain'],
  ['train_station', 'model.words.building.trainStation'],
  ['airport', 'model.words.building.airport'],
  ['stadium', 'model.words.building.stadium'],
  ['museum', 'model.words.building.museum'],
  ['cathedral', 'model.words.building.cathedral'],
  ['castle', 'model.words.building.castle'],
  ['theatre', 'model.words.building.theatre'],
  ['observatory', 'model.words.building.observatory'],
  ['butcher', 'model.words.building.butcher'],
  ['fishmonger', 'model.words.building.fishmonger'],
  ['cheesemonger', 'model.words.building.cheesemonger'],
  ['tailor', 'model.words.building.tailor'],
  ['cobbler', 'model.words.building.cobbler'],
  ['clothing_shop', 'model.words.building.clothingShop'],
  ['jeweler', 'model.words.building.jeweler'],
  ['apothecary', 'model.words.building.apothecary'],
  ['herbalist', 'model.words.building.herbalist'],
  ['barbershop', 'model.words.building.barbershop'],
  ['scribe', 'model.words.building.scribe'],
  ['bookstore', 'model.words.building.bookstore'],
  ['art_gallery', 'model.words.building.artGallery'],
  ['music_hall', 'model.words.building.musicHall'],
  ['cafe', 'model.words.building.cafe'],
  ['restaurant', 'model.words.building.restaurant'],
  ['hotel', 'model.words.building.hotel'],
  ['guild_hall', 'model.words.building.guildHall'],
  ['courthouse', 'model.words.building.courthouse'],
  ['city_hall', 'model.words.building.cityHall'],
  ['post_office', 'model.words.building.postOffice'],
  ['police_station', 'model.words.building.policeStation'],
  ['fire_station', 'model.words.building.fireStation'],
  ['pharmacy', 'model.words.building.pharmacy'],
  ['clinic', 'model.words.building.clinic'],
  ['spa', 'model.words.building.spa'],
  ['bathhouse', 'model.words.building.bathhouse'],
  ['greenhouse', 'model.words.building.greenhouse'],
  ['vineyard', 'model.words.building.vineyard'],
  ['ranch', 'model.words.building.ranch'],
  ['kennel', 'model.words.building.kennel'],
  ['dovecote', 'model.words.building.dovecote'],
  ['tannery', 'model.words.building.tannery'],
  ['goldsmith', 'model.words.building.goldsmith'],
  ['refinery', 'model.words.building.refinery'],
  ['power_plant', 'model.words.building.powerPlant'],
  ['substation', 'model.words.building.substation'],
  ['water_tower', 'model.words.building.waterTower'],
  ['reservoir', 'model.words.building.reservoir'],
  ['gas_station', 'model.words.building.gasStation'],
  ['auto_shop', 'model.words.building.autoShop'],
  ['garage', 'model.words.building.garage'],
  ['mall_shop', 'model.words.building.mallShop'],
  ['supermarket', 'model.words.building.supermarket'],
  ['office_tower', 'model.words.building.officeTower'],
  ['skyscraper', 'model.words.building.skyscraper'],
  ['datacenter', 'model.words.building.datacenter'],
  ['studio', 'model.words.building.studio'],
  ['spaceport', 'model.words.building.spaceport'],
  ['orbital_lift', 'model.words.building.orbitalLift'],
  ['solar_array', 'model.words.building.solarArray'],
  ['wind_farm', 'model.words.building.windFarm'],
  ['fusion_plant', 'model.words.building.fusionPlant'],
  ['neural_hub', 'model.words.building.neuralHub'],
  ['ai_core', 'model.words.building.aiCore'],
  ['biodome', 'model.words.building.biodome'],
  ['cryolab', 'model.words.building.cryolab'],
  ['nano_fab', 'model.words.building.nanoFab'],
  ['hyperloop', 'model.words.building.hyperloop'],
  ['maglev', 'model.words.building.maglev'],
  ['mega_hospital', 'model.words.building.megaHospital'],
  ['research_lab', 'model.words.building.researchLab'],
  ['megastructure', 'model.words.building.megastructure'],
  ['lamppost', 'model.words.building.lamppost'],
  ['signpost', 'model.words.building.signpost'],
  ['cart', 'model.words.building.cart'],
  ['pavilion', 'model.words.building.pavilion'],
  ['gazebo', 'model.words.building.gazebo'],
  ['bench', 'model.words.building.bench'],
  ['fence', 'model.words.building.fence'],
  ['gate', 'model.words.building.gate'],
  ['gallows', 'model.words.building.gallows'],
  ['monument', 'model.words.building.monument'],
  ['obelisk', 'model.words.building.obelisk'],
  ['cemetery', 'model.words.building.cemetery'],
  ['gravestone', 'model.words.building.gravestone'],
  ['orchard', 'model.words.building.orchard'],
  ['pond', 'model.words.building.pond'],
  ['playground', 'model.words.building.playground'],
  ['flagpole', 'model.words.building.flagpole'],
  ['bandstand', 'model.words.building.bandstand'],
  ['kiosk', 'model.words.building.kiosk'],
  ['billboard', 'model.words.building.billboard'],
  ['telephone_pole', 'model.words.building.telephonePole'],
  ['street_light', 'model.words.building.streetLight'],
  ['bus_stop', 'model.words.building.busStop'],
  ['parking_lot', 'model.words.building.parkingLot'],
  ['crosswalk', 'model.words.building.crosswalk'],
  ['pyramid', 'model.words.building.pyramid'],
  ['ziggurat', 'model.words.building.ziggurat'],
  ['coliseum', 'model.words.building.coliseum'],
  ['triumphal_arch', 'model.words.building.triumphalArch'],
  ['clock_tower', 'model.words.building.clockTower'],
  ['mosque', 'model.words.building.mosque'],
  ['synagogue', 'model.words.building.synagogue'],
  ['pagoda', 'model.words.building.pagoda'],
  ['stupa', 'model.words.building.stupa'],
  ['mausoleum', 'model.words.building.mausoleum'],
  ['hangar', 'model.words.building.hangar'],
  ['harbor_light', 'model.words.building.harborLight'],
  ['crane', 'model.words.building.crane'],
  ['radio_tower', 'model.words.building.radioTower'],
  ['satellite_dish', 'model.words.building.satelliteDish'],
  ['wind_turbine', 'model.words.building.windTurbine'],
  ['solar_panel', 'model.words.building.solarPanel'],
  ['charging_station', 'model.words.building.chargingStation'],
  ['robotic_arm', 'model.words.building.roboticArm'],
  ['drone', 'model.words.building.drone'],
  ['holo_board', 'model.words.building.holoBoard'],
  ['neon_sign', 'model.words.building.neonSign'],
  ['arcade', 'model.words.building.arcade'],
  ['grand_fountain', 'model.words.building.grandFountain'],
  ['food_truck', 'model.words.building.foodTruck'],
  ['biolab', 'model.words.building.biolab'],
  ['mushroom_farm', 'model.words.building.mushroomFarm'],
  ['aquaculture', 'model.words.building.aquaculture'],
])

/** An id shown as words: underscores become spaces. */
export function idWords(id: string): string {
  return id.replace(/_/g, ' ')
}

function wordOf(table: ReadonlyMap<string, MessageKey>, id: string | null | undefined): string {
  if (!id) return ''
  const key = table.get(id)
  return key ? t(key) : idWords(id)
}

/** The moon phase as words, e.g. "waxing gibbous". */
export function moonPhaseWord(phase: string | null | undefined): string {
  return wordOf(MOON_PHASES, phase)
}

/** The simulation's season as words, e.g. "abundance". */
export function seasonWord(season: string | null | undefined): string {
  return wordOf(SEASONS, season)
}

/** A building kind as words, e.g. "market stall". */
export function buildingKindWord(kind: string | null | undefined): string {
  return wordOf(BUILDING_KINDS, kind)
}

/** A discovery as words, e.g. "agriculture"; a discovery the table does not name is shown as its words. */
export function discoveryWord(id: string): string {
  const key = `model.words.discovery.${id}`
  if (hasMessage(key)) return t(key as MessageKey)
  // A finished building is discovered under its kind's id, so it reads as the building's name.
  return BUILDING_KINDS.has(id) ? buildingKindWord(id) : idWords(id)
}

/** A word from the table under `prefix`, or the id's own words when the table does not name it. */
function keyedWord(prefix: string, id: string): string {
  const key = `${prefix}.${id}`
  return hasMessage(key) ? t(key as MessageKey) : idWords(id)
}

/** A trade good as words, e.g. "bottled spirit". */
export function goodWord(good: string): string {
  return keyedWord('model.words.good', good)
}

/** A treaty kind as words, e.g. "non aggression". */
export function treatyWord(kind: string): string {
  return keyedWord('model.words.treaty', kind)
}

/** A relation status as words, e.g. "rivals". */
export function relationWord(status: string): string {
  return keyedWord('model.words.relation', status)
}
