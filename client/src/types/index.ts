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
  target_x?: number
  target_y?: number
  partner_id?: string | null
  father_id?: string | null
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

export interface VehicleInfo {
  id: number
  kind: string
  x: number
  y: number
  rider_id?: string | null
}

export interface FestivalInfo {
  name: string
  lineage_id?: string
  started?: number
  ends?: number
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
  daily_story: string
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
  kind: 'rabbit' | 'deer' | 'boar' | 'bird' | 'fish' | 'wolf' | 'dog'
  name?: string
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
  actor: string
  detail: string
}

export interface TribalRelation {
  a: string
  b: string
  attitude: number
  status: 'ally' | 'neutral' | 'rivals'
}

export interface WorldHistory {
  births: number
  deaths_old_age: number
  deaths_starvation: number
  deaths_dehydration: number
  deaths_sickness: number
  deaths_combat: number
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
  fertility?: number[][]
  hazard?: number[][]
}

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
    kind: 'clear' | 'rain' | 'storm' | 'wet'
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
  governments?: GovernmentInfo[]
  artworks?: ArtworkInfo[]
  farms?: FarmInfo[]
  settlements?: SettlementInfo[]
  vehicles?: VehicleInfo[]
  festivals?: FestivalInfo[]
  lineage_eras?: Array<{ lineage_id: string; era_name: string }> | Record<string, string>
  lineage_strategies?: Record<string, { strategy: string; expires_tick: number }>
  lineage_era_progress?: LineageEraProgress[]
  lineage_currencies?: Record<string, string>
  active_outbreaks?: OutbreakInfo[]
  cosmos?: CosmosState
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
  occupants?: string[]
  owner_lineage?: string | null
  lineage_id?: string | null
}
