export interface ThoughtEntry {
  tick: number
  text: string
}

export interface ConversationEntry {
  tick:      number
  with_name: string
  with_id:   string
  kind:      'courtship' | 'bonded' | 'farewell' | 'chat' | 'argue' | 'excited'
  lines:     [string, string][]   // [speaker_name, utterance]
  meanings?: string[]             // English caption for each line
}

export interface Traits {
  curiosity: number
  aggression: number
  fear: number
  memory_strength: number
  social_tendency: number
  resilience: number
}

/** Lean per-tick snapshot - heavy fields omitted, use OrgDetail for those */
export interface OrganismState {
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
  memory_count: { food: number; water: number; danger: number }
  attitudes: Record<string, number>
  org_trust: Record<string, number>
  traits: Traits
  infection:     number
  carrying:      number
  carrying_type: number   // 0=none, 1=wood, 2=stone
  home_x:      number
  home_y:      number
  discoveries: string[]
  is_elder:    boolean
  // Emotional state
  loneliness?:  number
  boredom?:     number
  fear_level?:  number
  comfort?:     number
  grief_ticks?: number
  sleep_debt?:  number
  partner_id?:     string | null
  father_id?:      string | null
  children_count?: number
  sex?:            'male' | 'female'
  pregnant?:       boolean
  attracted_to?:   string | null
  vocabulary?:         Record<string, string>   // small map - included in tick data for LanguageModal
  conversation_count?: number   // count only - full data in OrgDetail
}

/** Full detail - fetched on demand from GET /org/:id */
export interface OrgDetail extends OrganismState {
  thought_history: ThoughtEntry[]
  vocabulary:    Record<string, string>
  daily_story:   string
  life_log:      string[]
  conversations: ConversationEntry[]
}

export interface AnimalState {
  id: number
  x: number
  y: number
  kind: 'rabbit' | 'deer'
}

export interface SimEvent {
  tick: number
  type: 'born' | 'died' | 'signal' | 'alarm' | 'challenge' | 'gift' | 'treaty' | 'dawn' | 'dusk' | 'season' | 'drought' | 'outbreak' | 'build' | 'weather' | 'era'
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

/** Merged grid state held in the client cache - all dense, always fully populated. */
export interface GridState {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]               // dense - updated every 5 ticks
  fire_intensity: number[][]      // dense (rebuilt from sparse fire each tick)
  structure: number[][]           // dense (rebuilt from sparse structure each tick)
  biomes?: number[][]             // dense - updated every 30 ticks
  depth_map?: number[][]          // dense - updated every 30 ticks
}

/** Raw incoming WS grid payload - sparse fire/structure, optional static maps. */
export interface GridWire {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles?: number[][]
  fire: [number, number, number][]       // sparse: [row, col, v×1000]
  structure: [number, number, number][]  // sparse: [row, col, v×100]
  biomes?: number[][]
  depth_map?: number[][]
}

export interface WorldState {
  tick: number
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
  weather: { kind: 'clear' | 'rain' | 'storm'; intensity: number }
  history: WorldHistory
  story_history: StoryEntry[]
  pop_history: [number, number][]
  tribal_relations: TribalRelation[]
  lineage_sizes: { id: string; count: number }[]
  lineage_names?: Record<string, string>   // lineage_id → tribe name
  current_era?: string
  sex_words?:   [string, string]   // [0]=word for male biology, [1]=word for female biology - coined by founding generation
}
