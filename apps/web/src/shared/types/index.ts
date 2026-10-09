export interface ThoughtEntry {
  tick: number
  text: string
}

export interface ConversationEntry {
  tick: number
  with_name: string
  with_id: string
  kind: 'courtship' | 'bonded' | 'farewell' | 'chat' | 'argue' | 'excited'
  lines: [string, string][]
  meanings?: string[]
  id?: string
}

export interface Traits {
  curiosity: number
  aggression: number
  fear: number
  memory_strength: number
  social_tendency: number
  resilience: number
}

interface ExtendedEmotions {
  hope?: number
  awe?: number
  gratitude?: number
  jealousy?: number
  anger?: number
  regret?: number
  curiosity_drive?: number
  spiritual?: number
}

export interface OrganismState extends ExtendedEmotions {
  id: string
  name: string
  x: number
  y: number
  energy: number
  hydration: number
  health: number
  age: number
  alive: boolean
  death_cause?: string
  thought: string
  generation: number
  parent_id: string
  lineage_id: string
  max_age: number
  memory_count?: { food: number; water: number; danger: number }
  learning?: {
    states: number
    tried_actions: number
    promising_states: number
    confidence: number
  }
  attitudes?: Record<string, number>
  org_trust?: Record<string, number>
  traits: Traits
  infection: number
  carrying: number
  carrying_type: number
  home_x: number
  home_y: number
  discoveries: string[]
  is_elder: boolean
  is_leader?: boolean
  tools?: Record<string, number>
  loneliness?: number
  boredom?: number
  fear_level?: number
  comfort?: number
  grief_ticks?: number
  joy_ticks?: number
  aspiration?: string
  sleep_debt?: number
  vx?: number
  vy?: number
  // `null` means "the server cleared this" (a -32768 wander-target
  // sentinel). `undefined` means "not in this frame" and leaves the cached
  // value alone. Collapsing the two — as the type previously implied — is
  // what let a stale destination or partner persist indefinitely.
  target_x?: number | null
  target_y?: number | null
  partner_id?: string | null
  father_id?: string | null
  /** Family name: inherited from the father, else the mother. */
  surname?: string
  /** A name the player gave this person; shown in place of `name` when set. */
  custom_name?: string
  children_count?: number
  sex?: 'male' | 'female'
  pregnant?: boolean
  age_stage?: 'infant' | 'child' | 'teen' | 'adult' | 'elder'
  era?: string
  lineage_era?: string
  attracted_to?: string | null
  vocabulary?: Record<string, string>
  conversation_count?: number
  friends?: Record<string, string>
  attributes?: string[]
  inventory?: Record<string, number>
  home_furniture?: string[]
  home_style_seed?: number
  literacy?: number
  degrees?: string[]
  wealth?: number
  specialty?: string
  /** One word for how the person feels now (calm, content, hungry, grieving, ...). */
  mood?: string
  /** Personality words from the person's traits (brave, shy, curious, fierce, kind). */
  personality?: string[]
  /** How practised the person is at their specialty, 0 to 1. */
  skill?: number
  religion_id?: string | null
  piety?: number
  diseases?: Array<{ kind: string; started_tick: number }>
  mounted_vehicle?: number | null
  zodiac?: string
  birth_tick?: number
}

export interface CosmosState {
  moon_phase:
    | 'new_moon'
    | 'waxing_crescent'
    | 'first_quarter'
    | 'waxing_gibbous'
    | 'full_moon'
    | 'waning_gibbous'
    | 'last_quarter'
    | 'waning_crescent'
  moon_illum: number
  year: number
  day_of_year: number
}

export interface ReligionInfo {
  id: string
  name: string
  adherents?: number
  deity?: string
  lineage_id?: string
  kind?: string
  founder_lineage?: string
}

export interface BookInfo {
  id?: string
  title: string
  author_id?: string
  author_name?: string
  topic?: string
  tick?: number
  lineage_id?: string
  copies?: number
}

export interface HeadlineInfo {
  tick: number
  text: string
}

export interface BattleInfo {
  id: string
  attackers: string[]
  defenders: string[]
  scale: string
  location: [number, number]
  started_tick: number
  ended: boolean
  ended_tick?: number | null
  outcome?: string | null
  casualties_a: number
  casualties_d: number
  initial_a: number
  initial_d: number
}

export interface TreatyInfo {
  tick: number
  a_lineage: string
  b_lineage: string
  kind?: string
}

export interface TradeInfo {
  tick: number
  buyer_id: string
  seller_id: string
  good: string
  amount: number
  price: number
}

export interface TradeRouteInfo {
  id: number
  lineage_a: string
  lineage_b: string
  a_center: [number, number]
  b_center: [number, number]
  established_tick: number
  last_dispatch_tick: number
  deliveries: number
  volume: number
}

export interface CaravanInfo {
  id: number
  route_id: number
  sender_lineage: string
  receiver_lineage: string
  sender_org_id: string
  cargo: string
  amount: number
  unit_price: number
  departed_tick: number
  arrives_tick: number
  from: [number, number]
  to: [number, number]
}

export interface GovernmentInfo {
  lineage_id: string
  kind: string
  leader_id?: string | null
  treasury?: number
  tax_rate?: number
  laws?: string[]
}

export interface ArtworkInfo {
  id: number
  kind: string
  title: string
  creator_name: string
  x?: number
  y?: number
}

export interface OutbreakInfo {
  kind: string
  started?: number
  infected?: number
  lineage_id?: string
}

export interface FarmInfo {
  id: number
  x: number
  y: number
  crop?: string
  yield?: number
  lineage_id?: string
  planted_tick?: number
  ready_tick?: number
  harvested?: boolean
  stage?: 'fallow' | 'seeded' | 'growing' | 'mature' | 'harvested'
  progress?: number
}

export interface SettlementInfo {
  lineage_id: string
  name: string
  tier: number
  tier_name: string
  center: [number, number]
  population: number
  building_count: number
  capacity: number
  score: number
}

export interface CarcassInfo {
  x: number
  y: number
  /** The prey's kind (`deer`, `rabbit`, ...). */
  kind: string
  /** Ticks since the kill. */
  age: number
  /** Bird-ticks spent feeding on it so far. */
  picked: number
}

export interface VehicleInfo {
  building?: boolean
  /** The owner's era name (`pre-stone`, `bronze`, ...): picks the boat's hull. */
  era?: string
  /** Goods on deck. */
  cargo?: number
  id: number
  kind: string
  x: number
  y: number
  rider_id?: string | null
  /** A boat with a voyage to make (its wake shows). */
  sailing?: boolean
  /** The harbour of a fishing boat, where it is moored at night. */
  harbour?: [number, number] | null
  /** The way (a cardinal step) from the harbour to the dry land beside it: a pier runs that way. */
  shore?: [number, number] | null
}

export interface FestivalInfo {
  name: string
  kind?: string
  lineage_id?: string
  started?: number
  ends?: number
  /** Where it is held, in tiles. */
  x?: number
  y?: number
}

export interface LifeEvent {
  tick: number
  category: string
  text: string
  related_id?: string
  related_name?: string
}

export interface MemoryEntry {
  kind: 'core' | 'episode' | 'fact' | 'bond' | 'place' | 'dream'
  text: string
  salience: number
  emotion: number
  tick: number
  related_id?: string
  recalls: number
}

export interface OrgDetail extends OrganismState {
  thought_history: ThoughtEntry[]
  vocabulary: Record<string, string>
  life_log: LifeEvent[]
  conversations: ConversationEntry[]
  memories: MemoryEntry[]
}

export interface OrgLife {
  id: string
  name: string
  age_ticks: number
  generation: number
  lineage_id: string
  sex: string
  alive: boolean
  is_elder: boolean
  partner_id?: string | null
  children_count: number
  friends: string[]
  discoveries: string[]
  emotional_state: string
  events: LifeEvent[]
  thought_history: ThoughtEntry[]
  memories: MemoryEntry[]
  zodiac?: string
  aspiration?: string
}

export interface AnimalState {
  id: number
  x: number
  y: number
  kind:
    | 'rabbit'
    | 'deer'
    | 'boar'
    | 'bird'
    | 'fish'
    | 'wolf'
    | 'dog'
    | 'bear'
    | 'sheep'
    | 'cow'
    | 'horse'
    | 'chicken'
    | 'fox'
    | 'cat'
    | 'penguin'
    | 'camel'
    | 'frog'
    | 'whale'
    | 'duck'
    | 'bee'
    | 'owl'
    | 'eagle'
    | 'snake'
    | 'crocodile'
    | 'monkey'
    | 'goat'
    | 'elephant'
    | 'lion'
    | 'zebra'
    | 'polar_bear'
    | 'kangaroo'
    | 'zombie'
    | 'demon'
    | 'dragon'
    | 'alien'
    | 'ufo'
  name?: string
  /** Asleep for the winter (wild bears). */
  sleeping?: boolean
  /** Flown south for the winter (wild birds); not drawn. */
  away?: boolean
  /** Born recently (a newborn is drawn smaller); see `YOUNG_ANIMAL_TICKS` in the sim. */
  young?: boolean
}

export interface WardInfo {
  x: number
  y: number
  radius: number
  cast: number
  until: number
}

/** A chimney fouling the air; `s` is how thick its smoke is. */
export interface SmogInfo {
  x: number
  y: number
  s: number
}

export type PerilCause =
  | 'sickness'
  | 'hunger'
  | 'thirst'
  | 'no_children'
  | 'old_age'
  | 'dwindling'
  | 'war'
  | 'beasts'
  | 'drowning'
  | 'fire'
  | 'disaster'

export interface TribePeril {
  lineage_id: string
  tribe: string
  population: number
  peak: number
  cause: PerilCause
  since: number
}

export interface PrayerInfo {
  id: number
  lineage_id: string
  tribe: string
  kind: string
  x: number
  y: number
  created: number
  expires: number
}

export interface FaithInfo {
  by_lineage: Record<string, number>
  answered: number
  forsaken: number
  blessed: string[]
  despairing: string[]
}

export interface SimEvent {
  tick: number
  type:
    | 'born'
    | 'died'
    | 'signal'
    | 'alarm'
    | 'challenge'
    | 'gift'
    | 'treaty'
    | 'dawn'
    | 'dusk'
    | 'season'
    | 'drought'
    | 'outbreak'
    | 'build'
    | 'weather'
    | 'era'
    | 'strategy_complete'
    | 'strategy_failed'
    | 'strategy_redirected'
  actor: string
  detail: string
  /** Set by the sim on events worth the player's attention. */
  news?: boolean
}

export interface TribalRelation {
  a: string
  b: string
  attitude: number
  status: 'ally' | 'neutral' | 'rivals'
}

export interface WorldHistory {
  births: number
  /** Births and deaths in each calendar year from year 0 (see sim History). */
  births_by_year?: number[]
  deaths_by_year?: number[]
  /** The average tribe wealth gap (Gini) sampled at the start of each year. */
  wealth_gap_by_year?: number[]
  deaths_old_age: number
  deaths_starvation: number
  deaths_dehydration: number
  deaths_sickness: number
  deaths_combat: number
  deaths_beasts?: number
  deaths_drowning?: number
  deaths_fire?: number
  deaths_disaster?: number
  sickness_events: number
  alliances_formed: number
  challenges_total: number
  gifts_total: number
  droughts: number
  outbreaks: number
  era_history?: { tick: number; era: string }[]
}

export interface StoryEntry {
  tick: number
  org_name: string
  lineage_id: string
  story: string
}

export interface GridState {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  fire_intensity: number[][]
  structure: number[][]
  biomes?: number[][]
  depth_map?: number[][]
  food_trail?: number[][]
  water_trail?: number[][]
  path_trail?: number[][]
  /**
   * Cells whose `path_trail` is at least `PATH_TRAIL_HOT` (a superset: re-check the value),
   * as flattened `row, col` pairs in row-major order. Lets the renderer skip scanning the
   * whole grid for the handful of busy paths. Absent when the grid was not built from a wire.
   */
  path_trail_hot?: Int32Array
  fertility?: number[][]
  hazard?: number[][]
  /** Road kind per cell (0 none, see `ROAD_TRACK` in the simulation); absent before the first static frame. */
  roads?: number[][]
  /** Bumped when the road cells change, so the renderer re-reads them only then. */
  road_revision?: number
}

/** Path traffic at or above this is drawn as a worn track on the map. */
export const PATH_TRAIL_HOT = 0.55

export interface GridWire {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles?: number[][]
  fire: [number, number, number][]
  structure: [number, number, number][]
  biomes?: number[][]
  depth_map?: number[][]
  trails?: [number, number, number, number, number][]
  fertility?: [number, number, number][]
  fertility_dense?: number[] | Uint8Array
  hazard?: [number, number, number][]
  roads?: [number, number, number][]
}

export type Difficulty = 'calm' | 'normal' | 'harsh'

/** One goal as the Goals panel shows it (sim/goals.rs). */
export interface GoalStatus {
  id: string
  title: string
  progress: number
  target: number
  done: boolean
}

export interface WorldState {
  frame_id: number
  server_sent_at_ms: number
  frame_kind: 'delta' | 'full'
  tick: number
  population_limit?: number
  grid: GridState
  organisms: OrganismState[]
  organisms_complete?: boolean
  viewport_organisms?: OrganismState[]
  animals: AnimalState[]
  animals_complete?: boolean
  viewport_animals?: AnimalState[]
  events: SimEvent[]
  is_day: boolean
  day_progress: number
  season: string
  season_progress: number
  drought: boolean
  weather: {
    kind: 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'wet'
    intensity: number
    // Wind vector - drifts slowly each tick on the server. The 2D
    // canvas slants rain streaks along (wind_x, wind_y); 3D uses it
    // to rotate cloud motion.
    wind_x?: number
    wind_y?: number
  }
  history: WorldHistory
  story_history: StoryEntry[]
  pop_history: [number, number][]
  tribal_relations: TribalRelation[]
  lineage_sizes: { id: string; count: number }[]
  lineage_names?: Record<string, string>
  lineage_centroid_history?: Record<string, [number, number, number][]>
  /** The player's goals and how far they have got (sim/goals.rs). */
  goals?: GoalStatus[]
  difficulty?: Difficulty
  /** The tick the last person died, once the world is lost. */
  lost_tick?: number | null
  lineage_homes?: Record<string, [number, number, number]>
  current_era?: string
  featured_org_id?: string
  sex_words?: [string, string]
  territory?: {
    claimed: { lid: string; tiles: [number, number][] }[]
    contested: [number, number][]
  }
  buildings?: Building[]
  religions?: ReligionInfo[]
  books?: BookInfo[]
  headlines?: HeadlineInfo[]
  battles?: BattleInfo[]
  treaties?: TreatyInfo[]
  trades?: TradeInfo[]
  trade_routes?: TradeRouteInfo[]
  caravans?: CaravanInfo[]
  governments?: GovernmentInfo[]
  artworks?: ArtworkInfo[]
  farms?: FarmInfo[]
  /** Player plantings as flat [x, y, kind, stage, ...]. */
  plantings?: number[]
  prayers?: PrayerInfo[]
  /** This winter is a hard one. */
  hard_winter?: boolean
  /** Autumn's forecast that the coming winter will be hard. */
  hard_winter_ahead?: boolean
  faith?: FaithInfo
  /** Each tribe's dead of the last few seasons, by cause. */
  tribe_losses?: Record<string, Record<string, number>>
  /** The gods' wards over the land. */
  wards?: WardInfo[]
  /** Smoke from industry. */
  smog?: SmogInfo[]
  /** Tribes on the brink, and what is killing them. */
  tribes_in_peril?: TribePeril[]
  settlements?: SettlementInfo[]
  vehicles?: VehicleInfo[]
  /** Prey a predator killed, where birds gather: how long ago, and how much is picked over (0 to 40). */
  carcasses?: CarcassInfo[]
  festivals?: FestivalInfo[]
  lineage_eras?: Array<{ lineage_id: string; era_name: string }> | Record<string, string>
  /** Wealth Gini per tribe (0 even to 1 stark), for tribes of four or more. */
  lineage_inequality?: Array<{ lineage_id: string; gini: number; people: number }>
  /** Grain in each tribe's granaries (measures), for the tribe card and the trade agent. */
  lineage_food_stores?: Array<{ lineage_id: string; stock: number }>
  /** Livestock kept in each tribe's pens (head), for the tribe card. */
  lineage_livestock?: Array<{ lineage_id: string; head: number }>
  lineage_crime?: Array<{ lineage_id: string; thefts: number; murders: number; punished: number }>
  /** Generations per tribe: the oldest living one and how many have been reached. */
  lineage_generations?: Array<{ lineage_id: string; oldest: number; lived: number }>
  lineage_strategies?: Record<
    string,
    {
      strategy: string
      expires_tick: number
      started_tick?: number
      progress?: number
      target?: number
      completed?: boolean
      completed_tick?: number | null
      status?: 'active' | 'completed'
    }
  >
  lineage_strategy_history?: StrategyCampaignInfo[]
  lineage_era_progress?: LineageEraProgress[]
  lineage_currencies?: Record<string, string>
  active_outbreaks?: OutbreakInfo[]
  cosmos?: CosmosState
}

export interface StrategyCampaignInfo {
  lineage_id: string
  lineage_name: string
  strategy: string
  started_tick: number
  ended_tick: number
  progress: number
  target: number
  outcome: 'completed' | 'expired' | 'redirected' | 'failed'
  reason?: 'deadline' | 'player_redirected' | 'lineage_extinct' | null
}

export interface LineageEraProgress {
  lineage_id: string
  era_name: string
  next_era?: string | null
  pop: number
  pop_required: number
  pop_ready: boolean
  lineage_population?: number
  world_population?: number
  world_population_required?: number
  world_population_ready?: boolean
  required: string[]
  known: string[]
  missing: string[]
  discovery_ready: boolean
  ready: boolean
}

export type BuildingKind =
  | 'Hut'
  | 'House'
  | 'Manor'
  | 'TownHouse'
  | 'Apartment'
  | 'School'
  | 'University'
  | 'Library'
  | 'Market'
  | 'Temple'
  | 'Factory'
  | 'Hospital'
  | 'Forge'
  | 'Mill'
  | 'Bakery'
  | 'Inn'
  | 'Bank'
  | 'Workshop'
  | 'Granary'
  | 'Barracks'
  | 'Lighthouse'
  | 'Windmill'
  | 'Watermill'
  | 'Aqueduct'
  | 'Bridge'
  | 'Wall'
  | 'Tower'
  | 'Plaza'
  | 'Statue'
  | 'Fountain'
  | 'TrainStation'
  | 'Airport'
  | 'Port'
  | 'Stadium'
  | 'Museum'
  | 'Cathedral'
  | 'Castle'
  | 'Theatre'
  | 'Observatory'
  | 'Tavern'
  | 'Brewery'
  | 'Butcher'
  | 'Fishmonger'
  | 'Cheesemonger'
  | 'Tailor'
  | 'Cobbler'
  | 'ClothingShop'
  | 'Jeweler'
  | 'Apothecary'
  | 'Herbalist'
  | 'Barbershop'
  | 'Scribe'
  | 'BookStore'
  | 'ArtGallery'
  | 'MusicHall'
  | 'Cafe'
  | 'Restaurant'
  | 'Hotel'
  | 'GuildHall'
  | 'Courthouse'
  | 'CityHall'
  | 'PostOffice'
  | 'PoliceStation'
  | 'FireStation'
  | 'Pharmacy'
  | 'Clinic'
  | 'Spa'
  | 'Bathhouse'
  | 'Greenhouse'
  | 'Vineyard'
  | 'Ranch'
  | 'Stable'
  | 'Kennel'
  | 'Dovecote'
  | 'Quarry'
  | 'Mine'
  | 'SawMill'
  | 'Tannery'
  | 'Smithy'
  | 'Goldsmith'
  | 'Refinery'
  | 'PowerPlant'
  | 'Substation'
  | 'WaterTower'
  | 'Reservoir'
  | 'GasStation'
  | 'AutoShop'
  | 'Garage'
  | 'MallShop'
  | 'Supermarket'
  | 'OfficeTower'
  | 'Skyscraper'
  | 'Datacenter'
  | 'Studio'
  | 'Spaceport'
  | 'OrbitalLift'
  | 'SolarArray'
  | 'WindFarm'
  | 'FusionPlant'
  | 'NeuralHub'
  | 'AiCore'
  | 'Biodome'
  | 'Cryolab'
  | 'NanoFab'
  | 'Hyperloop'
  | 'Maglev'
  | 'Hospital2'
  | 'ResearchLab'
  | 'Megastructure'
  | 'Well'
  | 'Lamppost'
  | 'Signpost'
  | 'MarketStall'
  | 'FoodCart'
  | 'Cart'
  | 'Tent'
  | 'Pavilion'
  | 'Gazebo'
  | 'Bench'
  | 'Fence'
  | 'Gate'
  | 'Watchtower'
  | 'Gallows'
  | 'Monument'
  | 'Obelisk'
  | 'Shrine'
  | 'Cemetery'
  | 'GraveStone'
  | 'Garden'
  | 'Orchard'
  | 'Pond'
  | 'PlayGround'
  | 'FlagPole'
  | 'Bandstand'
  | 'Kiosk'
  | 'BillBoard'
  | 'TelephonePole'
  | 'StreetLight'
  | 'BusStop'
  | 'ParkingLot'
  | 'Crosswalk'
  | 'Pyramid'
  | 'Ziggurat'
  | 'Coliseum'
  | 'TriumphalArch'
  | 'ClockTower'
  | 'Mosque'
  | 'Synagogue'
  | 'Pagoda'
  | 'Stupa'
  | 'Mausoleum'
  | 'Hangar'
  | 'Silo'
  | 'Warehouse'
  | 'Dock'
  | 'Marina'
  | 'Lighthouse2'
  | 'Drydock'
  | 'Crane'
  | 'RadioTower'
  | 'SatelliteDish'
  | 'WindTurbine'
  | 'SolarPanel'
  | 'ChargingStation'
  | 'RoboticArm'
  | 'Drone'
  | 'HoloBoard'
  | 'NeonSign'
  | 'ArcadeBox'
  | 'Fountain2'
  | 'FoodTruck'
  | 'Greenhouse2'
  | 'MushroomFarm'
  | 'Aquaculture'
  | 'Pen'

export type BuildingFunction =
  | 'Housing'
  | 'Education'
  | 'Industry'
  | 'Healthcare'
  | 'Worship'
  | 'Military'
  | 'Civic'
  | 'Commerce'
  | 'Infrastructure'

export interface Building {
  id: number
  kind: string
  function?: BuildingFunction
  x: number
  y: number
  footprint?: [number, number]
  fw?: number
  fh?: number
  condition?: number
  construction_progress?: number
  /** Structural damage, kept separate from construction progress. */
  damage?: number
  /** Remaining structural integrity (`1 - damage`). */
  integrity?: number
  /** Destroyed buildings remain non-operational until rebuilt. */
  ruined?: boolean
  /** True while workers are actively repairing or rebuilding the structure. */
  repairing?: boolean
  ruined_at_tick?: number | null
  last_damage_tick?: number | null
  last_repair_tick?: number | null
  occupants?: string[]
  owner_lineage?: string | null
  lineage_id?: string | null
}
