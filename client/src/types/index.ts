export interface ThoughtEntry {
  tick: number
  text: string
}

export interface ConversationEntry {
  tick:      number
  with_name: string
  with_id:   string
  kind:      'courtship' | 'bonded' | 'farewell' | 'chat' | 'argue' | 'excited'
  lines:     [string, string][]
  meanings?: string[]
  id?:       string
}

export interface Traits {
  curiosity: number
  aggression: number
  fear: number
  memory_strength: number
  social_tendency: number
  resilience: number
}

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
  memory_count?: { food: number; water: number; danger: number }
  attitudes?: Record<string, number>
  org_trust?: Record<string, number>
  traits: Traits
  infection:     number
  carrying:      number
  carrying_type: number
  home_x:      number
  home_y:      number
  discoveries: string[]
  is_elder:    boolean
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
  vocabulary?:         Record<string, string>
  conversation_count?: number
  friends?:            Record<string, string>
}

export interface LifeEvent {
  tick:         number
  category:     string
  text:         string
  related_id?:  string
  related_name?: string
}

export interface OrgDetail extends OrganismState {
  thought_history: ThoughtEntry[]
  vocabulary:    Record<string, string>
  daily_story:   string
  life_log:      LifeEvent[]
  conversations: ConversationEntry[]
}

export interface OrgLife {
  id:              string
  name:            string
  age_ticks:       number
  generation:      number
  lineage_id:      string
  sex:             string
  alive:           boolean
  is_elder:        boolean
  partner_id?:     string | null
  children_count:  number
  friends:         string[]
  discoveries:     string[]
  emotional_state: string
  events:          LifeEvent[]
  thought_history: ThoughtEntry[]
}

export interface AnimalState {
  id: number
  x: number
  y: number
  kind: 'rabbit' | 'deer' | 'boar' | 'bird' | 'fish' | 'wolf' | 'dog'
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
  hazard?: [number, number, number][]
}

export interface WorldState {
  frame_id: number
  server_sent_at_ms: number
  frame_kind: 'delta' | 'full'
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
  weather: { kind: 'clear' | 'rain' | 'storm' | 'wet'; intensity: number }
  history: WorldHistory
  story_history: StoryEntry[]
  pop_history: [number, number][]
  tribal_relations: TribalRelation[]
  lineage_sizes: { id: string; count: number }[]
  lineage_names?: Record<string, string>
  lineage_centroid_history?: Record<string, [number, number, number][]>
  current_era?: string
  sex_words?:   [string, string]
}
