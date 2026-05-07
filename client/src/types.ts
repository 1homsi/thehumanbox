export interface ThoughtEntry {
  tick: number
  text: string
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
  thought_history: ThoughtEntry[]
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
  vocabulary:    Record<string, string>
  daily_story: string
  home_x:      number
  home_y:      number
  discoveries: string[]
  life_log:    string[]
  is_elder:    boolean
  // Emotional state
  loneliness?:  number
  boredom?:     number
  fear_level?:  number
  comfort?:     number
  grief_ticks?: number
  sleep_debt?:  number
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

export interface WorldState {
  tick: number
  grid: {
    width: number
    height: number
    origin_x: number
    origin_y: number
    tiles: number[][]
    fire_intensity: number[][]
    biomes?: number[][]
    structure?: number[][]
    fertility_map?: number[][]
    hazard_map?: number[][]
    pressure_map?: number[][]
  }
  organisms: OrganismState[]
  animals: AnimalState[]
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
  current_era?: string
}
