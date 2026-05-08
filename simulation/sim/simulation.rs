use rand::Rng;
use serde::{Serialize, Deserialize};
use std::collections::{HashMap, HashSet, VecDeque};
use crate::organism::organism::{Organism, DIRECTIONS, generate_tribe_name};
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::{grid::{WorldGrid, TrailKind, WIDTH, HEIGHT}, tiles::Tile};
use crate::physics::engine::PhysicsEngine;
use super::config::{DAY_LENGTH, SEASON_LENGTH, SEASONS, season_growth};
use super::world_events::{DroughtState, WeatherState, tick_drought, tick_outbreak, tick_weather, tick_world_evolution, push_event};
use super::{social, growth, courtship};

// ── Public types ─────────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
pub struct StoryEntry {
    pub tick:       u64,
    pub org_name:   String,
    pub lineage_id: String,
    pub story:      String,
}

#[derive(Clone)]
pub struct ThinkTrigger {
    pub org_id:            String,
    pub org_name:          String,
    pub lineage_id:        String,
    pub scenario:          String,
    pub target_lineage:    Option<String>,
    pub kin_count:         usize,
    pub energy_avg:        f32,
    pub context:           String,
    pub discoveries:       Vec<String>,
    pub life_log_top:      Vec<String>,
    pub emotional_state:   String,
    pub other_name:        Option<String>,
    pub other_discoveries: Vec<String>,
    pub target_org_id:     Option<String>,
    // Organism traits — used by local resolver to make classification decisions
    // without calling Groq (only elder_teaching needs the real LLM).
    pub aggression:        f32,
    pub fear:              f32,
    pub social_tendency:   f32,
    pub curiosity:         f32,
    pub resilience:        f32,
}

impl Default for ThinkTrigger {
    fn default() -> Self {
        ThinkTrigger {
            org_id: String::new(), org_name: String::new(),
            lineage_id: String::new(), scenario: String::new(),
            target_lineage: None, kin_count: 0, energy_avg: 0.5,
            context: String::new(), discoveries: Vec::new(),
            life_log_top: Vec::new(), emotional_state: String::new(),
            other_name: None, other_discoveries: Vec::new(),
            target_org_id: None,
            // Middle-of-the-road defaults — push sites set these to real values
            // for accurate weighting; 0.5 gives a neutral balanced distribution.
            aggression: 0.5, fear: 0.5, social_tendency: 0.5,
            curiosity: 0.5, resilience: 0.5,
        }
    }
}

impl ThinkTrigger {
    /// Copy real trait values from a live organism into the trigger.
    pub fn with_traits(mut self, org: &Organism) -> Self {
        self.aggression      = org.traits.aggression;
        self.fear            = org.traits.fear;
        self.social_tendency = org.traits.social_tendency;
        self.curiosity       = org.traits.curiosity;
        self.resilience      = org.traits.resilience;
        self
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Event {
    pub tick:   u64,
    #[serde(rename = "type")]
    pub etype:  String,
    pub actor:  String,
    pub detail: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct History {
    pub births:              u64,
    pub deaths_old_age:      u64,
    pub deaths_starvation:   u64,
    pub deaths_dehydration:  u64,
    pub deaths_sickness:     u64,
    pub deaths_combat:       u64,
    pub sickness_events:     u64,
    pub alliances_formed:    u64,
    pub challenges_total:    u64,
    pub gifts_total:         u64,
    pub droughts:            u64,
    pub outbreaks:           u64,
    #[serde(default)]
    pub era_history:         VecDeque<EraEntry>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct EraEntry {
    pub tick: u64,
    pub era:  String,
}

// ── Simulation ────────────────────────────────────────────────────────────────

pub struct Simulation {
    pub grid:                  WorldGrid,
    pub physics:               PhysicsEngine,
    pub organisms:             Vec<Organism>,
    pub animals:               Vec<Animal>,
    pub tick_count:            u64,
    pub events:                VecDeque<Event>,
    pub history:               History,
    pub drought:               DroughtState,
    pub weather:               WeatherState,
    pub flood_tiles:           Vec<(i32, i32, u64)>,
    pub story_history:         VecDeque<StoryEntry>,
    pub pending_thinks:        Vec<ThinkTrigger>,
    pub lineage_names:         HashMap<String, String>,  // lineage_id → tribe name
    pub lineage_strategies:    HashMap<String, (String, u64)>,
    lineage_last_council:      HashMap<String, u64>,
    lineage_elders:            HashMap<String, String>,
    lineage_negotiations:      HashMap<(String,String), u64>,
    pub pop_history:           VecDeque<[u64; 2]>,
    pub current_era:           String,
    pub sex_words:             [String; 2],  // [0]=word for Male, [1]=word for Female — coined by founding generation
    pub world_seed:            u64,          // seed used for this world's terrain — persisted so depth/elevation reload correctly
    next_animal_id:            usize,
    rng:                       rand::rngs::SmallRng,
    // ── Throttled-computation cache ─────────────────────────────────────────
    // These are derived from organism data; not saved, recomputed every N ticks.
    cached_tribal_relations:   serde_json::Value,  // recomputed every 60 ticks
    cached_lineage_sizes:      serde_json::Value,  // recomputed every 30 ticks
    slow_compute_tick:         u64,
    // ── Hot-set for non-zero structure tiles ───────────────────────────────
    active_structure_tiles:    HashSet<(i32, i32)>,  // tiles with structure > 0; not saved
}

// Returns the possible inventions given current discoveries (prerequisites already met)
fn invention_candidates(discoveries: &HashSet<String>) -> Vec<&'static str> {
    let has = |s: &str| discoveries.contains(s);
    let mut v = Vec::new();
    if has("fire") && has("wood")              && !has("cooking")     { v.push("cooking"); }
    if has("fire") && has("stone")             && !has("stone_tools") { v.push("stone_tools"); }
    if has("shelter") && has("stone")          && !has("masonry")     { v.push("masonry"); }
    if has("stone") && has("hunt")             && !has("spear")       { v.push("spear"); }
    if has("fire") && has("shelter")           && !has("torch")       { v.push("torch"); }
    if has("fire") && has("cooking")           && !has("medicine")    { v.push("medicine"); }
    if has("wood") && has("hunt")              && !has("trap")        { v.push("trap"); }
    if has("fire") && has("shelter")           && !has("ritual")      { v.push("ritual"); }
    if has("wood")                             && !has("basket")      { v.push("basket"); }
    if has("masonry") && has("water")          && !has("irrigation")  { v.push("irrigation"); }
    v
}

impl Simulation {
    pub fn new(seed: u64) -> Self {
        use rand::SeedableRng;
        let rng  = rand::rngs::SmallRng::seed_from_u64(seed);
        let grid = WorldGrid::new(seed);
        let physics = PhysicsEngine::new();

        // Generate the two sex-category words from organism phoneme pool.
        // The founding generation "coins" these — they are the culture's own names.
        let sex_words = {
            use crate::organism::vocabulary::gen_phoneme_word;
            use rand::SeedableRng;
            let mut word_rng = rand::rngs::SmallRng::seed_from_u64(seed.wrapping_add(0xc0ffee));
            let w0 = gen_phoneme_word(&mut word_rng);
            let mut w1 = gen_phoneme_word(&mut word_rng);
            while w1 == w0 { w1 = gen_phoneme_word(&mut word_rng); }
            [w0, w1]
        };

        let mut sim = Simulation {
            grid, physics,
            organisms: Vec::new(),
            animals: Vec::new(),
            tick_count: 0,
            events: VecDeque::new(),
            history: History::default(),
            drought: DroughtState::default(),
            weather: WeatherState::default(),
            flood_tiles: Vec::new(),
            story_history: VecDeque::new(),
            pending_thinks: Vec::new(),
            lineage_names:        HashMap::new(),
            lineage_strategies:   HashMap::new(),
            lineage_last_council: HashMap::new(),
            lineage_elders:       HashMap::new(),
            lineage_negotiations: HashMap::new(),
            pop_history: VecDeque::new(),
            current_era: "genesis".to_string(),
            sex_words,
            world_seed: seed,
            next_animal_id: 0,
            rng,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes:    serde_json::Value::Array(vec![]),
            slow_compute_tick:       0,
            active_structure_tiles:  HashSet::new(),
        };
        sim.spawn_founders();
        sim.spawn_animals(25);
        sim
    }

    fn spawn_founders(&mut self) {
        use crate::world::tiles::Tile;
        use uuid::Uuid;
        // 12 founding tribes × 10 members = 120. Each tribe shares a lineage_id
        // so tribal identity, language, and relationships exist from day one.
        const N_TRIBES:    usize = 12;
        const TRIBE_SIZE:  usize = 10;
        const TRIBE_RADIUS: i32  = 16;  // land search radius around each anchor

        // ── Step 1: pick anchor positions — one per water pool, rest random ──
        let mut anchors: Vec<(i32, i32)> = self.grid.pool_centers
            .iter()
            .map(|&(cx, cy)| (cx, cy))
            .collect();

        // If fewer pools than tribes, scatter remaining anchors across all land
        if anchors.len() < N_TRIBES {
            let mut all_land: Vec<(i32, i32)> = (2..(HEIGHT as i32 - 2))
                .flat_map(|y| (2..(WIDTH as i32 - 2)).map(move |x| (x, y)))
                .filter(|&(x, y)| matches!(self.grid.get(x, y), Tile::Grass | Tile::Food))
                .collect();
            let n = all_land.len();
            let mut placed = anchors.len();
            let mut i = 0usize;
            while placed < N_TRIBES && i < n {
                let j = i + self.rng.gen_range(0..(n - i));
                all_land.swap(i, j);
                let (x, y) = all_land[i];
                // keep tribes at least 30 tiles apart
                let far_enough = anchors.iter().all(|&(ax, ay)| {
                    (ax - x).abs() + (ay - y).abs() >= 30
                });
                if far_enough { anchors.push((x, y)); placed += 1; }
                i += 1;
            }
        }
        anchors.truncate(N_TRIBES);

        // ── Step 2: for each anchor, spawn TRIBE_SIZE organisms with shared lineage ──
        for &(ax, ay) in &anchors {
            // Generate the shared lineage identity for this tribe
            let lineage_id = Uuid::new_v4().to_string()[..8].to_string();
            let tribe_name = generate_tribe_name(&mut self.rng);
            self.lineage_names.insert(lineage_id.clone(), tribe_name);

            // Collect nearby land tiles
            let mut land: Vec<(i32, i32)> = Vec::new();
            for dx in -TRIBE_RADIUS..=TRIBE_RADIUS {
                for dy in -TRIBE_RADIUS..=TRIBE_RADIUS {
                    let nx = ax + dx; let ny = ay + dy;
                    if !crate::world::grid::WorldGrid::in_bounds(nx, ny) { continue; }
                    if matches!(self.grid.get(nx, ny), Tile::Grass | Tile::Food) {
                        land.push((nx, ny));
                    }
                }
            }
            if land.is_empty() { continue; }

            // Shuffle and take up to TRIBE_SIZE positions
            let n = land.len();
            let take = TRIBE_SIZE.min(n);
            for i in 0..take {
                let j = i + self.rng.gen_range(0..(n - i));
                land.swap(i, j);
            }
            for k in 0..take {
                let (lx, ly) = land[k];
                growth::spawn_organism_with_lineage(
                    &self.grid, &mut self.organisms,
                    lx as f32, ly as f32,
                    lineage_id.clone(),
                    &mut self.rng,
                );
            }
        }

        // ── Step 3: top up to exactly 120 if any tribe had too little land ───
        let target = N_TRIBES * TRIBE_SIZE;
        let still_needed = target.saturating_sub(self.organisms.len());
        if still_needed > 0 {
            // Distribute the remainder evenly across existing tribes
            let tribe_ids: Vec<String> = self.lineage_names.keys().cloned().collect();
            let n_tribes = tribe_ids.len();
            let mut all_land: Vec<(i32, i32)> = (2..(HEIGHT as i32 - 2))
                .flat_map(|y| (2..(WIDTH as i32 - 2)).map(move |x| (x, y)))
                .filter(|&(x, y)| matches!(self.grid.get(x, y), Tile::Grass | Tile::Food))
                .collect();
            let n = all_land.len();
            let mut spawned = 0;
            let mut i = 0usize;
            while spawned < still_needed && i < n {
                let j = i + self.rng.gen_range(0..(n - i));
                all_land.swap(i, j);
                let (x, y) = all_land[i];
                let lid = tribe_ids[spawned % n_tribes].clone();
                growth::spawn_organism_with_lineage(
                    &self.grid, &mut self.organisms,
                    x as f32, y as f32,
                    lid,
                    &mut self.rng,
                );
                spawned += 1;
                i += 1;
            }
        }
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    pub fn tick(&mut self) {
        self.tick_count += 1;

        let season = self.season();
        self.physics.growth_mult = season_growth(season);

        if self.tick_count % 5 == 0 {
            self.physics.tick(&mut self.grid, &mut self.rng);
        }

        // Clear daily life-log at dawn (dawn/dusk/season no longer pushed to event buffer
        // — they crowded out real events since dawn fires every 3 min real-time)
        let phase = self.tick_count % DAY_LENGTH;
        if phase == 0 {
            for org in &mut self.organisms {
                org.life_log.clear();
            }
        }

        // Collect event/history refs via pointer gymnastics — easiest to just clone when needed
        let season_str = season.to_string();
        tick_drought(
            &mut self.drought,
            &mut self.grid,
            &self.organisms,
            &self.weather,
            self.tick_count,
            &season_str,
            &mut self.history,
            &mut self.events,
            &mut self.rng,
        );
        tick_outbreak(
            &mut self.organisms,
            &mut self.grid,
            self.tick_count,
            &season_str,
            &mut self.history,
            &mut self.events,
            &mut self.rng,
        );
        tick_weather(
            &mut self.weather,
            &mut self.grid,
            &mut self.organisms,
            self.tick_count,
            &season_str,
            &mut self.events,
            &mut self.rng,
        );

        if self.tick_count % 300 == 0 {
            tick_world_evolution(
                &mut self.grid,
                &mut self.organisms,
                &mut self.flood_tiles,
                self.tick_count,
                &season_str,
                self.drought.active,
                &self.weather,
                &mut self.events,
                &mut self.rng,
            );
        }

        // World memory layer decay — fertility recovers, hazard & pressure fade
        if self.tick_count % 500 == 0 {
            self.grid.decay_world_layers();
        }

        // World era detection — track historical periods
        if self.tick_count % 1200 == 0 {
            let new_era = self.compute_era();
            if new_era != self.current_era {
                self.history.era_history.push_back(EraEntry {
                    tick: self.tick_count,
                    era:  new_era.clone(),
                });
                if self.history.era_history.len() > 60 {
                    self.history.era_history.pop_front();
                }
                push_event(&mut self.events, self.tick_count, "era", "world",
                    &format!("the {} era begins", new_era));
                self.current_era = new_era;
            }
        }

        // Pregnancy deliveries — check every tick for due mothers
        growth::deliver_births(&mut self.organisms, self.tick_count,
                               &mut self.events, &mut self.history);

        // Track population once per in-world day
        if self.tick_count % DAY_LENGTH == 0 {
            let alive = self.organisms.iter().filter(|o| o.alive).count() as u64;
            self.pop_history.push_back([self.tick_count, alive]);
            if self.pop_history.len() > 1000 { self.pop_history.pop_front(); }
        }

        // ── Elder recomputation ───────────────────────────────────────────────
        // The oldest living organism per lineage is the elder — tribal memory keeper.
        if self.tick_count % 200 == 0 {
            let mut candidates: HashMap<String, (String, u32)> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                let e = candidates.entry(org.lineage_id.clone()).or_insert_with(|| (org.id.clone(), 0));
                if org.age > e.1 { *e = (org.id.clone(), org.age); }
            }
            self.lineage_elders.clear();
            for (lid, (id, _)) in candidates {
                self.lineage_elders.insert(lid, id);
            }
            let elder_ids: std::collections::HashSet<String> =
                self.lineage_elders.values().cloned().collect();
            for org in self.organisms.iter_mut() {
                org.is_elder = elder_ids.contains(&org.id);
            }
        }

        let alive_count_before_loop = self.organisms.iter().filter(|o| o.alive).count();
        for i in 0..self.organisms.len() {
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                self.tick_organism(i, alive_count_before_loop);

                // Post-birth: if a child was just born, seed it with elder knowledge
                if self.organisms.len() > prev_len {
                    let child_idx = self.organisms.len() - 1;
                    let child_lid = self.organisms[child_idx].lineage_id.clone();
                    if let Some(elder_id) = self.lineage_elders.get(&child_lid).cloned() {
                        if let Some(epos) = self.organisms.iter().position(|o| o.alive && o.id == elder_id) {
                            if epos != child_idx {
                                let danger: Vec<_> = self.organisms[epos].danger_memory.iter().map(|(&k, &v)| (k, v)).collect();
                                let food:   Vec<_> = self.organisms[epos].food_memory.iter().map(|(&k, &v)| (k, v)).collect();
                                let child = &mut self.organisms[child_idx];
                                let ms = child.traits.memory_strength;
                                for (k, v) in danger {
                                    if self.rng.gen::<f32>() < 0.45 {
                                        Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.4, ms);
                                    }
                                }
                                for (k, v) in food {
                                    if self.rng.gen::<f32>() < 0.20 {
                                        Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.2, ms);
                                    }
                                }

                                // Elder oral tradition: LLM generates a teaching from elder's lived experience
                                if !self.organisms[epos].life_log.is_empty() {
                                    let elder_name = self.organisms[epos].name.clone();
                                    let elder_id   = self.organisms[epos].id.clone();
                                    let life_top: Vec<String> = self.organisms[epos].life_log
                                        .iter().take(4).cloned().collect();
                                    let child_name = self.organisms[child_idx].name.clone();
                                    let child_id   = self.organisms[child_idx].id.clone();
                                    let lid        = self.organisms[child_idx].lineage_id.clone();
                                    self.pending_thinks.push(ThinkTrigger {
                                        org_id:        elder_id,
                                        org_name:      elder_name,
                                        lineage_id:    lid,
                                        scenario:      "elder_teaching".to_string(),
                                        other_name:    Some(child_name),
                                        target_org_id: Some(child_id),
                                        life_log_top:  life_top,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Prune old dead organisms — keep last 300 for family-tree display
        if self.tick_count % 1200 == 0 {
            let dead_count = self.organisms.iter().filter(|o| !o.alive).count();
            if dead_count > 300 {
                let excess = dead_count - 300;
                let mut removed = 0usize;
                self.organisms.retain(|o| {
                    if o.alive { return true; }
                    if removed < excess { removed += 1; return false; }
                    true
                });
            }
        }

        self.tick_animals();
        self.check_animal_catches();

        // ── Structure decay and tile transitions ──────────────────────────────
        // Structures decay passively; organisms must place material to maintain them.
        // Transition: structure >= 0.85 auto-upgrades tile to Hut, below 0.1 demotes Hut to Ash.
        {
            let storm = self.weather.kind >= 2;
            let decay = if storm { 0.00025 } else { 0.000025 };
            let mut promote = Vec::new();
            let mut demote  = Vec::new();
            let mut to_remove = Vec::new();
            for &(x, y) in &self.active_structure_tiles {
                let s = self.grid.structure_at(x, y);
                if s <= 0.0 { to_remove.push((x, y)); continue; }
                let ns = (s - decay).max(0.0);
                *self.grid.structure_at_mut(x, y) = ns;
                if ns == 0.0 { to_remove.push((x, y)); }
                let tile = self.grid.get(x, y);
                if ns >= 0.85 && tile != Tile::Hut {
                    promote.push((x, y));
                } else if ns < 0.1 && tile == Tile::Hut {
                    demote.push((x, y));
                }
            }
            for (x, y) in to_remove { self.active_structure_tiles.remove(&(x, y)); }
            for (x, y) in promote { self.grid.set(x, y, Tile::Hut); }
            for (x, y) in demote  { self.grid.set(x, y, Tile::Ash); }
        }
    }

    fn tick_organism(&mut self, idx: usize, alive_count: usize) {
        let night   = self.is_night();
        let epsilon = (0.5 - self.organisms[idx].age as f32 * 0.00008).max(0.12);

        let prev_energy    = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;

        // ── Inner emotional state ─────────────────────────────────────────────
        {
            let org = &self.organisms[idx];
            let kin_near = self.organisms.iter()
                .filter(|o| o.alive && !std::ptr::eq(*o, org) && o.lineage_id == org.lineage_id)
                .filter(|o| (o.x - org.x).abs() + (o.y - org.y).abs() <= 5.0)
                .count();
            let (ox2, oy2) = (org.x as i32, org.y as i32);
            let near_shelter = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| {
                let nx = ox2 + dx; let ny = oy2 + dy;
                matches!(self.grid.get(nx, ny), Tile::Hut | Tile::Rock)
                    || self.grid.structure_at(nx, ny) >= 0.35
            }));
            let hostile_near = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id != org.lineage_id)
                .filter(|o| (o.x - org.x).abs() + (o.y - org.y).abs() <= 6.0)
                .any(|o| org.attitude_toward(&o.lineage_id) < -0.2);
            let weather_kind = self.weather.kind;
            let tick_now = self.tick_count;
            self.organisms[idx].tick_inner_state(kin_near, near_shelter, hostile_near, weather_kind, tick_now, night);
        }

        // ── Territory defense — organisms near their elder's home grow hostile toward intruders ──
        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let intruders: Vec<String> = if let Some(elder_id) = self.lineage_elders.get(&my_lid) {
                let elder_id = elder_id.clone();
                if let Some(elder) = self.organisms.iter().find(|o| o.alive && o.id == elder_id) {
                    let (ex, ey) = (elder.home_x, elder.home_y);
                    let org = &self.organisms[idx];
                    if (org.x - ex).abs() + (org.y - ey).abs() < 20.0 {
                        self.organisms.iter()
                            .filter(|o| o.alive && o.lineage_id != my_lid)
                            .filter(|o| (o.x - ex).abs() + (o.y - ey).abs() < 12.0)
                            .map(|o| o.lineage_id.clone())
                            .collect()
                    } else { vec![] }
                } else { vec![] }
            } else { vec![] };
            for intruder_lid in intruders {
                let att = self.organisms[idx].lineage_attitudes.entry(intruder_lid).or_insert(0.0);
                *att = (*att - 0.0015).max(-1.0);
            }
        }

        let animal_near = {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            self.animals.iter().any(|a| a.alive && (a.x - ox).abs() + (a.y - oy).abs() <= 8.0)
        };
        let perception = self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near);
        let (action, new_thought) = self.organisms[idx].choose_action(
            &self.grid, self.tick_count, epsilon, &self.organisms, night,
            self.weather.kind, &mut self.rng, animal_near, &perception);
        if let Some(t) = new_thought {
            self.organisms[idx].think(&t, self.tick_count);
        }

        let (ix, iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);

        // ── Execute action ────────────────────────────────────────────────────
        let mut signal_reward = 0.0f32;

        if action < 8 {
            let (dx, dy) = DIRECTIONS[action];
            // Move 2 tiles per step — mid tile must also be clear to prevent jumping over walls
            let (mx, my) = (ix + dx,     iy + dy);
            let (nx, ny) = (ix + dx * 2, iy + dy * 2);
            let mid_ok  = self.grid.get(mx, my).walkable();
            let dest_ok = self.grid.get(nx, ny).walkable();
            let (fx, fy) = if mid_ok && dest_ok { (nx, ny) } else if mid_ok { (mx, my) } else { (ix, iy) };
            if fx != ix || fy != iy {
                self.organisms[idx].x = fx as f32;
                self.organisms[idx].y = fy as f32;
                self.grid.leave_trail(fx, fy, TrailKind::Path, 0.06);
                self.grid.stamp_pressure(fx, fy);
                // Farmers passively cultivate parched land they walk through
                let has_farming = self.organisms[idx].discoveries.contains("farm");
                if has_farming {
                    let fidx = WorldGrid::idx(fx, fy);
                    if self.grid.fertility[fidx] < 0.25 {
                        self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.004).min(0.55);
                    }
                }
            }
        } else if action == 8 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Food {
                let cooking_bonus = if self.organisms[idx].discoveries.contains("cooking") {
                    let near_fire = [(-1,0),(1,0),(0,-1),(0,1)].iter()
                        .any(|&(dx,dy)| matches!(self.grid.get(cx+dx, cy+dy), Tile::Campfire | Tile::Fire));
                    if near_fire { 0.12 } else { 0.0 }
                } else { 0.0 };
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.35 + cooking_bonus).min(1.0);
                let ms = self.organisms[idx].traits.memory_strength;
                Organism::remember(&mut self.organisms[idx].food_memory, cx, cy, 1.0, ms);
                self.grid.set(cx, cy, Tile::Grass);
                self.grid.reduce_fertility(cx, cy, 0.07);
                self.organisms[idx].think("food consumed here", self.tick_count);
                self.organisms[idx].log_event(format!("found and ate food at ({},{})", cx, cy));
                self.grid.leave_trail(cx, cy, TrailKind::Food, 2.0);
                self.broadcast_discovery(idx, cx, cy, "food", 8);
                if self.organisms[idx].infection > 0.01 {
                    self.organisms[idx].infection *= 0.88;
                }
            } else {
                let key = (cx, cy);
                if let Some(v) = self.organisms[idx].food_memory.get_mut(&key) {
                    *v *= 0.15;
                }
            }
        } else if action == 9 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Water {
                self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.35).min(1.0);
                let ms = self.organisms[idx].traits.memory_strength;
                Organism::remember(&mut self.organisms[idx].water_memory, cx, cy, 1.0, ms);
                self.organisms[idx].think("water consumed here", self.tick_count);
                self.organisms[idx].log_event(format!("drank from water at ({},{})", cx, cy));
                self.grid.leave_trail(cx, cy, TrailKind::Water, 2.0);
                self.broadcast_discovery(idx, cx, cy, "water", 8);
                self.organisms[idx].discover("water");
                if self.organisms[idx].infection > 0.01 {
                    self.organisms[idx].infection *= 0.94;
                }
            }
        } else if action == 10 {
            signal_reward += social::signal_food(idx, &mut self.organisms,
                                                 &self.grid, self.tick_count, &mut self.events, &mut self.rng);
        } else if action == 11 {
            signal_reward += social::sound_alarm(idx, &mut self.organisms,
                                                 &self.grid, self.tick_count, &mut self.events, &mut self.rng);
        } else if action == 12 {
            if self.tick_count - self.organisms[idx].last_challenged >= 80 {
                let before = signal_reward;
                signal_reward += social::challenge_stranger(idx, &mut self.organisms,
                    self.tick_count, &mut self.events, &mut self.history);
                if signal_reward > before {
                    self.organisms[idx].log_event(
                        format!("challenged a stranger near ({},{})", ix, iy));
                }
            } else {
                self.organisms[idx].think("challenging (nobody)", self.tick_count);
            }
        } else if action == 13 {
            let before = signal_reward;
            signal_reward += social::gift_knowledge(idx, &mut self.organisms,
                self.tick_count, &mut self.events, &mut self.history, &mut self.rng);
            if signal_reward > before {
                self.organisms[idx].log_event(
                    format!("shared knowledge with kin near ({},{})", ix, iy));

                // Negotiation: when an established cross-lineage relationship hits a trust threshold
                let actor_lid = self.organisms[idx].lineage_id.clone();
                let neg_target: Option<(usize, String)> = self.organisms.iter().enumerate()
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id != actor_lid)
                    .filter(|(_, o)| (o.x - ix as f32).abs() + (o.y - iy as f32).abs() < 7.0)
                    .filter_map(|(i, o)| {
                        let att   = self.organisms[idx].attitude_toward(&o.lineage_id);
                        let trust = *self.organisms[idx].org_trust.get(&o.id).unwrap_or(&0.0);
                        if att > 0.4 && trust > 0.3 { Some((i, o.lineage_id.clone())) } else { None }
                    })
                    .next();

                if let Some((ti, their_lid)) = neg_target {
                    let neg_key = {
                        let (a, b) = (actor_lid.clone(), their_lid.clone());
                        if a < b { (a, b) } else { (b, a) }
                    };
                    let last_neg = *self.lineage_negotiations.get(&neg_key).unwrap_or(&0);
                    if self.tick_count - last_neg >= 6000 {
                        self.lineage_negotiations.insert(neg_key, self.tick_count);
                        let my_disc: Vec<String>    = self.organisms[idx].discoveries.iter().cloned().collect();
                        let their_disc: Vec<String> = self.organisms[ti].discoveries.iter().cloned().collect();
                        let their_name = self.organisms[ti].name.clone();
                        let their_oid  = self.organisms[ti].id.clone();
                        let my_kin = self.organisms.iter().filter(|o| o.alive && o.lineage_id == actor_lid).count();
                        self.pending_thinks.push(ThinkTrigger {
                            org_id:            self.organisms[idx].id.clone(),
                            org_name:          self.organisms[idx].name.clone(),
                            lineage_id:        actor_lid.clone(),
                            scenario:          "negotiation".to_string(),
                            target_lineage:    Some(their_lid),
                            target_org_id:     Some(their_oid),
                            discoveries:       my_disc,
                            other_name:        Some(their_name),
                            other_discoveries: their_disc,
                            kin_count:         my_kin,
                            ..Default::default()
                        });
                    }
                }
            }
        } else if action == 14 {
            // Gather materials — stone from Rock adjacency, wood/organic otherwise
            if self.organisms[idx].carrying == 0 {
                let tile = self.grid.get(ix, iy);
                // Check if any adjacent tile is Rock → gather stone
                let rock_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
                    .iter().any(|&(dx, dy)| matches!(self.grid.get(ix+dx, iy+dy), Tile::Rock));
                if rock_near {
                    self.organisms[idx].carrying      = 200;
                    self.organisms[idx].carrying_type = 2; // stone
                    signal_reward += 0.004;
                    self.organisms[idx].think("gathering stone", self.tick_count);
                    let name = self.organisms[idx].name.clone();
                    if self.organisms[idx].discover("stone") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "found stone");
                    }
                } else if matches!(tile, Tile::Grass | Tile::Food) {
                    self.organisms[idx].carrying      = 250;
                    self.organisms[idx].carrying_type = 1; // wood/organic
                    signal_reward += 0.004;
                    self.organisms[idx].think("gathering wood", self.tick_count);
                    self.organisms[idx].discover("wood");
                }
            }
        } else if action == 15 {
            // Light a campfire — only organic/wood fuel works, not stone
            let tile = self.grid.get(ix, iy);
            if self.organisms[idx].carrying > 0
               && self.organisms[idx].carrying_type != 2
               && matches!(tile, Tile::Grass | Tile::Ash | Tile::Food | Tile::Snow | Tile::Sand)
            {
                self.grid.set(ix, iy, Tile::Campfire);
                *self.grid.fire_intensity_mut(ix, iy) = 1.0;
                self.physics.register_fire(ix, iy);
                self.organisms[idx].carrying      = 0;
                self.organisms[idx].carrying_type = 0;
                signal_reward += 0.05;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("tending fire", self.tick_count);
                self.organisms[idx].log_event(format!("lit a fire at ({},{})", ix, iy));
                push_event(&mut self.events, self.tick_count, "build", &name, "lit a campfire");
                if self.organisms[idx].discover("fire") {
                    push_event(&mut self.events, self.tick_count, "build", &name, "discovered fire");
                    // Trigger discovery think
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: self.organisms[idx].lineage_id.clone(),
                        scenario:   "discovery".to_string(),
                        context:    "fire".to_string(),
                        discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                        ..Default::default()
                    });
                }
            }
        } else if action == 16 {
            // Groom: reduces infection spread between kin, deepens trust
            if self.tick_count - self.organisms[idx].last_groomed >= 60 {
                signal_reward += social::groom(idx, &mut self.organisms,
                                               self.tick_count, &mut self.events);
            }
        }

        // Re-read current tile after move
        let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let current_tile = self.grid.get(cx, cy);

        // ── Fire damage ───────────────────────────────────────────────────────
        if current_tile == Tile::Fire {
            let fire_dmg = 0.08 * (1.5 - self.organisms[idx].traits.resilience);
            let fire_dmg = if night { fire_dmg * 0.5 } else { fire_dmg };
            if night { self.organisms[idx].health = (self.organisms[idx].health + 0.0005).min(1.0); }
            self.organisms[idx].health = (self.organisms[idx].health - fire_dmg).max(0.0);
            self.grid.add_hazard(cx, cy, 0.025);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, cx, cy, 0.8, ms);
            self.organisms[idx].think("heat dangerous", self.tick_count);
            self.broadcast_discovery(idx, cx, cy, "danger", 12);
            if self.rng.gen::<f32>() < 0.15 * (1.0 - self.organisms[idx].traits.resilience) {
                self.organisms[idx].infection =
                    (self.organisms[idx].infection + 0.02).min(1.0);
            }
        }

        // ── Passive memory from standing tile ─────────────────────────────────
        if current_tile == Tile::Water {
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].water_memory, cx, cy, 0.2, ms);
        }
        if current_tile == Tile::Food {
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].food_memory, cx, cy, 0.2, ms);
        }

        // ── Vital drain (applied after shelter bonuses below) ────────────────
        // Moved after the shelter_strength computation so shelter can reduce drain.

        // ── Carrying decay ────────────────────────────────────────────────────
        if self.organisms[idx].carrying > 0 {
            self.organisms[idx].carrying -= 1;
            if self.organisms[idx].carrying == 0 {
                self.organisms[idx].carrying_type = 0;
            }
        }

        // ── Passive structure accumulation (stigmergy) ────────────────────────
        // Organisms carrying materials deposit traces wherever they spend time.
        // No "build" intent — shelter emerges from where they live with their load.
        // Stone deposits more durable traces than wood.
        if self.organisms[idx].carrying > 0 {
            let tile = self.grid.get(cx, cy);
            if matches!(tile, Tile::Grass | Tile::Food | Tile::Ash | Tile::Hut | Tile::Snow | Tile::Sand) {
                let prev_s = self.grid.structure_at(cx, cy);
                let has_masonry = self.organisms[idx].discoveries.contains("masonry");
                let deposit = match (self.organisms[idx].carrying_type, has_masonry) {
                    (2, true)  => 0.0090, // stone + masonry knowledge
                    (2, false) => 0.0060, // stone
                    _          => 0.0035, // wood
                };
                self.grid.add_structure(cx, cy, deposit);
                self.active_structure_tiles.insert((cx, cy));
                let new_s = self.grid.structure_at(cx, cy);
                let name = self.organisms[idx].name.clone();
                if prev_s < 0.35 && new_s >= 0.35 {
                    push_event(&mut self.events, self.tick_count, "build", &name, "a crude shelter took shape");
                    // Shelter discovery fires at crude-shelter threshold — more achievable
                    if self.organisms[idx].discover("shelter") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "understood shelter");
                        let lid = self.organisms[idx].lineage_id.clone();
                        self.pending_thinks.push(ThinkTrigger {
                            org_id:      self.organisms[idx].id.clone(),
                            org_name:    self.organisms[idx].name.clone(),
                            lineage_id:  lid,
                            scenario:    "discovery".to_string(),
                            context:     "shelter".to_string(),
                            discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                            ..Default::default()
                        });
                    }
                }
            }
        }

        // ── Shelter & settlement bonuses ─────────────────────────────────────
        // Shelter is a genuine survival anchor: it reduces drain, accelerates recovery,
        // speeds infection clearance, and stabilises emotional state.
        let shelter_strength = {
            let mut s = 0.0f32;
            'sw: for ddx in -3i32..=3 {
                for ddy in -3i32..=3 {
                    let nx = cx + ddx; let ny = cy + ddy;
                    let t = self.grid.get(nx, ny);
                    if t == Tile::Campfire { s = 0.55; break 'sw; }
                    if t == Tile::Hut      { s = 0.90; break 'sw; }
                    let st = self.grid.structure_at(nx, ny);
                    if st >= 0.35 { s = s.max(st); }
                }
            }
            s
        };
        if shelter_strength > 0.0 {
            // Energy regeneration (scales with shelter quality)
            let energy_bonus = 0.0008 + shelter_strength * 0.0022;
            self.organisms[idx].energy = (self.organisms[idx].energy + energy_bonus).min(1.0);

            // Reduce energy drain (combat cold/exhaustion passively)
            // (Applied as a negative to the drain that happens below — we note this here
            //  and account for it by not re-draining the recovered amount)

            // Health regeneration — shelter lets the body heal even when not perfectly nourished
            let health_regen = 0.0006 + shelter_strength * 0.0010;
            self.organisms[idx].health = (self.organisms[idx].health + health_regen).min(1.0);

            // Infection clearance boost — dry, safe environment fights sickness
            if self.organisms[idx].infection > 0.01 {
                let inf_mult = 0.992 - shelter_strength * 0.006; // up to 3× faster clearance
                self.organisms[idx].infection =
                    (self.organisms[idx].infection * inf_mult.max(0.980)).max(0.0);
            }

            // Fear stabilisation near home
            if self.organisms[idx].fear_level > 0.0 {
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level - shelter_strength * 0.008).max(0.0);
            }

            // Grief recovery faster under roof
            if self.organisms[idx].grief_ticks > 0 && self.rng.gen::<f32>() < shelter_strength * 0.12 {
                self.organisms[idx].grief_ticks =
                    self.organisms[idx].grief_ticks.saturating_sub(3);
            }

            // Home range drift: home_x/home_y gradually migrates toward where they shelter
            // This is how settlement emerges — organisms anchor to places they actually use
            let drift = 0.00025 * shelter_strength;
            self.organisms[idx].home_x += (cx as f32 - self.organisms[idx].home_x) * drift;
            self.organisms[idx].home_y += (cy as f32 - self.organisms[idx].home_y) * drift;
        }

        // ── Kin home convergence ──────────────────────────────────────────────
        // Every 60 ticks, pull this organism's home coords slightly toward the
        // average home of nearby same-lineage kin. Creates tribal settlement gravity
        // without any hardcoded village placement.
        if self.tick_count % 60 == (idx as u64 % 60) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (hx, hy) = (self.organisms[idx].home_x, self.organisms[idx].home_y);
            let mut sum_x = 0.0f32;
            let mut sum_y = 0.0f32;
            let mut count = 0u32;
            for other in &self.organisms {
                if !other.alive || other.id == self.organisms[idx].id { continue; }
                if other.lineage_id != lid { continue; }
                let dx = (other.home_x - hx).abs();
                let dy = (other.home_y - hy).abs();
                if dx < 40.0 && dy < 40.0 {
                    sum_x += other.home_x;
                    sum_y += other.home_y;
                    count += 1;
                }
            }
            if count > 0 {
                let avg_x = sum_x / count as f32;
                let avg_y = sum_y / count as f32;
                // Very gentle pull — shelter drift dominates, this just coheres the tribe
                self.organisms[idx].home_x += (avg_x - hx) * 0.0015;
                self.organisms[idx].home_y += (avg_y - hy) * 0.0015;
            }
        }

        // ── Vital drain ───────────────────────────────────────────────────────
        // Shelter reduces metabolic energy drain (warmth, rest, protection from elements).
        // Hydration is unaffected — organisms still need water regardless of shelter.
        let shelter_drain_mult = if shelter_strength > 0.0 {
            (1.0 - shelter_strength * 0.35).max(0.65)
        } else {
            1.0
        };
        self.organisms[idx].energy    = (self.organisms[idx].energy    - 0.003 * shelter_drain_mult).max(0.0);
        self.organisms[idx].hydration = (self.organisms[idx].hydration - 0.002).max(0.0);
        if night {
            let has_torch = self.organisms[idx].discoveries.contains("torch");
            // Shelter also halves night cold-drain — a roof keeps warmth in
            let night_base = if has_torch { 0.0002 } else { 0.0005 };
            let night_drain = night_base * shelter_drain_mult;
            self.organisms[idx].energy = (self.organisms[idx].energy - night_drain).max(0.0);
        }

        // ── Temperature stress ────────────────────────────────────────────────
        let temp = self.grid.temp_at(cx, cy);
        let resilience = self.organisms[idx].traits.resilience;
        if temp < 10.0 || temp > 30.0 {
            let stress = if temp < 10.0 { (10.0 - temp) / 40.0 } else { (temp - 30.0) / 70.0 };
            // Shelter insulates: strong roof blocks up to 60% of thermal stress
            let temp_shelter = 1.0 - shelter_strength * 0.60;
            let drain = stress * 0.003 * (1.1 - resilience * 0.2) * temp_shelter;
            self.organisms[idx].energy = (self.organisms[idx].energy - drain).max(0.0);
            // Extreme heat also drains hydration faster — but shade helps
            if temp > 40.0 {
                self.organisms[idx].hydration = (self.organisms[idx].hydration - drain * 0.5).max(0.0);
            }
        }
        let inf = self.organisms[idx].infection;
        if inf > 0.01 {
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.001 * inf).max(0.0);
            if inf > 0.6 {
                self.organisms[idx].health =
                    (self.organisms[idx].health - 0.001 * (inf - 0.6)).max(0.0);
            }
            let thought = self.organisms[idx].thought.clone();
            if inf > 0.25 && matches!(thought.as_str(), "exploring"|"observing"|"satisfied"|"on path") {
                self.organisms[idx].think("feeling weak", self.tick_count);
            }
            self.organisms[idx].infection *= 0.997;
        }

        // Medicine discovery speeds infection recovery
        if self.organisms[idx].infection > 0.01 {
            let med_mult = if self.organisms[idx].discoveries.contains("medicine") {
                0.990
            } else {
                0.997
            };
            self.organisms[idx].infection = (self.organisms[idx].infection * med_mult).max(0.0);
        }

        // Trap: passive food capture near food trails for orgs with trap knowledge
        if self.organisms[idx].discoveries.contains("trap") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_trail = self.grid.detect_trail(cx2, cy2, TrailKind::Food, 3);
            if food_trail > 0.45 && self.rng.gen::<f32>() < 0.0025 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.14).min(1.0);
                self.organisms[idx].think("trap caught something", self.tick_count);
                let name = self.organisms[idx].name.clone();
                push_event(&mut self.events, self.tick_count, "hunt", &name, "trap catch");
            }
        }

        // Ritual discovery: near campfire at night → comfort and morale bonus
        if night && self.organisms[idx].discoveries.contains("ritual") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-3i32..=3).any(|ddx| (-3i32..=3).any(|ddy| {
                self.grid.get(cx2 + ddx, cy2 + ddy) == Tile::Campfire
            }));
            if near_fire {
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.003).min(1.0);
                self.organisms[idx].loneliness = (self.organisms[idx].loneliness - 0.005).max(0.0);
            }
        }

        // Background pathogen — wetlands amplify disease spread (stagnant water, humidity)
        {
            use crate::world::tiles::Biome;
            let biome = self.grid.biome_at(
                self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let pathogen_rate = match biome {
                Biome::Wetland => 0.00050, // 4× — disease swamps
                Biome::Volcanic => 0.00020, // toxic fumes
                _ => 0.00012,
            };
            if self.organisms[idx].infection < 0.05 && self.rng.gen::<f32>() < pathogen_rate {
                self.organisms[idx].infection =
                    0.35 * (1.0 - self.organisms[idx].traits.resilience * 0.4);
            }
        }

        // ── Infection spread ──────────────────────────────────────────────────
        if self.organisms[idx].infection < 0.8 {
            let spreaders: Vec<(f32, f32, f32)> = self.organisms.iter()
                .enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.infection >= 0.15)
                .filter(|(_, o)| (o.x - self.organisms[idx].x).abs()
                                +(o.y - self.organisms[idx].y).abs() <= 2.0)
                .map(|(_, o)| (o.infection, 0.0, 0.0))
                .collect();
            let res = self.organisms[idx].traits.resilience;
            let prev_inf = self.organisms[idx].infection;
            for (other_inf, _, _) in spreaders {
                let spread = 0.015 * other_inf * (1.0 - res * 0.8);
                self.organisms[idx].infection =
                    (self.organisms[idx].infection + spread).min(1.0);
            }
            if prev_inf < 0.15 && self.organisms[idx].infection >= 0.15 {
                self.history.sickness_events += 1;
            }
        }

        // ── Regen / senescence ────────────────────────────────────────────────
        let senescence_start = if self.organisms[idx].max_age > 0 {
            (self.organisms[idx].max_age as f32 * 0.65) as u32
        } else {
            u32::MAX
        };
        let well_nourished = self.organisms[idx].energy > 0.6 && self.organisms[idx].hydration > 0.6;
        if well_nourished && current_tile != Tile::Fire && self.organisms[idx].infection < 0.3 {
            let regen = if self.organisms[idx].age < senescence_start { 0.001 } else { 0.0003 };
            self.organisms[idx].health = (self.organisms[idx].health + regen).min(1.0);
        }
        if self.organisms[idx].max_age > 0 && self.organisms[idx].age > senescence_start {
            let decline = ((self.organisms[idx].age - senescence_start) as f32
                / (self.organisms[idx].max_age - senescence_start).max(1) as f32).min(1.0);
            self.organisms[idx].energy =
                (self.organisms[idx].energy - 0.001 * decline).max(0.0);
        }

        self.organisms[idx].age += 1;
        if self.organisms[idx].age % 100 == 0 {
            self.organisms[idx].decay_memory();
        }

        // ── Reward computation ────────────────────────────────────────────────
        let mut reward = (self.organisms[idx].energy    - prev_energy)    * 2.0
                       + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        if current_tile == Tile::Fire { reward -= 0.5; }

        // Kin proximity reward
        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lineage  = self.organisms[idx].lineage_id.clone();
        let soc      = self.organisms[idx].traits.social_tendency;
        let kin_count = self.organisms.iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 4.0)
            .count().saturating_sub(1);
        // Cap at 1 nearby kin for social reward — beyond that, no extra benefit
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

        // Crowding penalty — quadratic past 2, gets painful fast
        let crowding = self.organisms.iter()
            .filter(|o| o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0)
            .count().saturating_sub(1);
        if crowding > 2 {
            let excess = (crowding - 2) as f32;
            reward -= 0.006 * excess * excess;
        }

        // Stranger attitude reward
        let att_adjustments: Vec<(usize, f32)> = self.organisms.iter().enumerate()
            .filter(|(i, o)| *i != idx && o.alive && o.lineage_id != lineage)
            .filter(|(_, o)| (o.x - ox).abs() + (o.y - oy).abs() <= 4.0)
            .map(|(i, o)| {
                let att = self.organisms[idx].attitude_toward(&o.lineage_id);
                (i, att)
            })
            .collect();
        for (_, att) in &att_adjustments {
            if *att >= 0.25 {
                reward += 0.003;
            } else {
                reward -= 0.002;
            }
        }
        for (i, att) in att_adjustments {
            if att >= 0.25 {
                let lid = self.organisms[i].lineage_id.clone();
                self.organisms[idx].update_attitude(&lid, 0.001);
                // passive knowledge spread
                if self.rng.gen::<f32>() < 0.04 {
                    let to_share: Vec<((i32,i32), f32)> = self.organisms[i].food_memory.iter()
                        .filter(|(_, &v)| v > 0.4)
                        .take(1)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let ms = self.organisms[idx].traits.memory_strength;
                    for ((x,y), v) in to_share {
                        Organism::remember(&mut self.organisms[idx].food_memory, x, y, v*0.12, ms);
                    }
                }
            }
        }

        // Lineage fitness reward
        let kin_orgs: Vec<f32> = self.organisms.iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .map(|o| o.energy)
            .collect();
        if kin_orgs.len() >= 3 && self.organisms[idx].energy > 0.4 {
            let avg = kin_orgs.iter().sum::<f32>() / kin_orgs.len() as f32;
            reward += 0.003 * (avg - 0.5).max(0.0);
        }

        reward += signal_reward;

        // Inner-state reward modifiers — organisms feel the benefit of their actions
        let loneliness = self.organisms[idx].loneliness;
        let boredom    = self.organisms[idx].boredom;
        let comfort    = self.organisms[idx].comfort;
        // Social actions feel extra good when lonely
        if loneliness > 0.5 && signal_reward > 0.0 {
            reward += loneliness * 0.015;
        }
        // Building/exploring feels meaningful when bored
        if boredom > 0.4 && matches!(action, 14 | 15 | 16 | 0..=7) {
            reward += boredom * 0.008;
        }
        // Being comfortable in a good spot is its own reward (reinforces settling)
        if comfort > 0.75 {
            reward += (comfort - 0.75) * 0.01;
        }

        // Active tribe strategy bonus
        {
            let lid = self.organisms[idx].lineage_id.clone();
            if let Some((strategy, expiry)) = self.lineage_strategies.get(&lid) {
                if *expiry > self.tick_count {
                    let bonus: f32 = match strategy.as_str() {
                        "hunt"   if action < 8 => 0.008,
                        "explore" => 0.004,
                        _ => 0.0,
                    };
                    reward += bonus;
                }
            }
        }

        let next_perception = self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near);
        self.organisms[idx].learn(&perception, action, reward, &next_perception);

        // ── Social thoughts ───────────────────────────────────────────────────
        if self.organisms[idx].energy > 0.7 && self.organisms[idx].hydration > 0.7 {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let nearby_kin = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id == lineage && (o.x-ox).abs()+(o.y-oy).abs() <= 3.0)
                .count().saturating_sub(1);
            let nearby_stranger_count = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id != lineage && (o.x-ox).abs()+(o.y-oy).abs() <= 3.0)
                .count();
            let thought = self.organisms[idx].thought.clone();
            if nearby_kin >= 1 && matches!(thought.as_str(), "exploring"|"observing"|"satisfied") {
                self.organisms[idx].think("socializing", self.tick_count);
                social::social_knowledge_share(idx, &mut self.organisms, self.tick_count, &mut self.rng);
            } else if nearby_stranger_count >= 1
                && matches!(thought.as_str(), "exploring"|"observing"|"satisfied"|"wary"|"coexisting peacefully")
            {
                let nearest_lid: Option<String> = self.organisms.iter()
                    .filter(|o| o.alive && o.lineage_id != lineage
                            && (o.x-ox).abs()+(o.y-oy).abs() <= 3.0)
                    .min_by(|a,b| {
                        let da = (a.x-ox).abs()+(a.y-oy).abs();
                        let db = (b.x-ox).abs()+(b.y-oy).abs();
                        da.partial_cmp(&db).unwrap()
                    })
                    .map(|o| o.lineage_id.clone());
                if let Some(lid) = nearest_lid {
                    if self.organisms[idx].attitude_toward(&lid) >= 0.25 {
                        self.organisms[idx].think("coexisting peacefully", self.tick_count);
                    } else {
                        self.organisms[idx].think("wary", self.tick_count);
                    }
                }
            } else if matches!(thought.as_str(), "exploring"|"observing") {
                self.organisms[idx].think("satisfied", self.tick_count);
            }
        }

        // ── AI think triggers ─────────────────────────────────────────────────
        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);

            // First contact: unseen lineage within range
            let unknown_lid: Option<String> = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id != my_lid)
                .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 5.0)
                .filter(|o| !self.organisms[idx].lineage_attitudes.contains_key(&o.lineage_id))
                .map(|o| o.lineage_id.clone())
                .next();
            if let Some(stranger_lid) = unknown_lid {
                // Mark as seen immediately to prevent re-queuing
                self.organisms[idx].lineage_attitudes.insert(stranger_lid.clone(), 0.001);
                self.pending_thinks.push(ThinkTrigger {
                    org_id:         self.organisms[idx].id.clone(),
                    org_name:       self.organisms[idx].name.clone(),
                    lineage_id:     my_lid.clone(),
                    scenario:       "first_contact".to_string(),
                    target_lineage: Some(stranger_lid),
                    kin_count:      0,
                    energy_avg:     self.organisms[idx].energy,
                    ..Default::default()
                });
            }

            // Council: 5+ well-fed kin nearby, throttled per lineage — elder speaks
            let last_council = *self.lineage_last_council.get(&my_lid).unwrap_or(&0);
            if self.tick_count - last_council >= 6000 {
                let kin_energies: Vec<f32> = self.organisms.iter()
                    .filter(|o| o.alive && o.lineage_id == my_lid)
                    .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
                    .map(|o| o.energy)
                    .collect();
                if kin_energies.len() >= 5 {
                    let avg = kin_energies.iter().sum::<f32>() / kin_energies.len() as f32;
                    if avg > 0.7 {
                        // The elder speaks for the tribe — not a random member
                        let (elder_name, elder_age, elder_gen, elder_ctx) = {
                            if let Some(eid) = self.lineage_elders.get(&my_lid) {
                                let eid = eid.clone();
                                if let Some(e) = self.organisms.iter().find(|o| o.alive && o.id == eid) {
                                    let ctx = format!("age:{} gen:{} memories:{}",
                                        e.age, e.generation, e.danger_memory.len() + e.food_memory.len());
                                    (e.name.clone(), e.age, e.generation, ctx)
                                } else {
                                    let o = &self.organisms[idx];
                                    (o.name.clone(), o.age, o.generation, String::new())
                                }
                            } else {
                                let o = &self.organisms[idx];
                                (o.name.clone(), o.age, o.generation, String::new())
                            }
                        };
                        self.lineage_last_council.insert(my_lid.clone(), self.tick_count);
                        self.pending_thinks.push(ThinkTrigger {
                            org_id:     self.organisms[idx].id.clone(),
                            org_name:   elder_name,
                            lineage_id: my_lid.clone(),
                            scenario:   "council".to_string(),
                            kin_count:  kin_energies.len(),
                            energy_avg: avg,
                            context:    elder_ctx,
                            ..Default::default()
                        });
                    }
                }
            }

            // Individual directives — throttled per organism
            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 4000 {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy     = self.organisms[idx].energy;
                let hydration  = self.organisms[idx].hydration;

                // Survival crisis: both hungry AND thirsty
                if energy < 0.25 && hydration < 0.25 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "survival_crisis".to_string(),
                        energy_avg: energy,
                        context:    format!("energy={:.0}% water={:.0}%",
                            energy * 100.0, hydration * 100.0),
                        ..Default::default()
                    });
                // Abundance: thriving, no immediate needs
                } else if energy > 0.85 && hydration > 0.85 {
                    let kin_count = self.organisms.iter()
                        .filter(|o| o.alive && o.lineage_id == my_lid)
                        .count();
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "abundance".to_string(),
                        kin_count,
                        energy_avg: energy,
                        ..Default::default()
                    });
                // Threat: hostile lineage within 8 tiles
                } else {
                    let (hostile_near, kin_near) = {
                        let org = &self.organisms[idx];
                        let hostile = self.organisms.iter()
                            .filter(|o| o.alive && o.lineage_id != org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .any(|o| org.attitude_toward(&o.lineage_id) < -0.3);
                        let kin = self.organisms.iter()
                            .filter(|o| o.alive && o.lineage_id == org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .count();
                        (hostile, kin)
                    };
                    if hostile_near {
                        self.organisms[idx].last_think_tick = self.tick_count;
                        self.pending_thinks.push(ThinkTrigger {
                            org_id:     self.organisms[idx].id.clone(),
                            org_name:   self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario:   "threat".to_string(),
                            kin_count:  kin_near,
                            energy_avg: energy,
                            ..Default::default()
                        });
                    }
                }
            }

            // Emotional triggers — separate throttle
            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 6000 {
                let loneliness = self.organisms[idx].loneliness;
                let boredom    = self.organisms[idx].boredom;
                let energy     = self.organisms[idx].energy;

                if loneliness > 0.78 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "lonely".to_string(),
                        energy_avg: energy,
                        ..Default::default()
                    });
                } else if boredom > 0.72 && energy > 0.75 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "restless".to_string(),
                        energy_avg: energy,
                        ..Default::default()
                    });
                }
            }

            // ── Migration pressure — seasonal food scarcity triggers relocation debate ─────
            let season_now = self.season();
            if matches!(season_now, "winter" | "dry") {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let last_think_m = self.organisms[idx].last_think_tick;
                let food_nearby = (-6i32..=6).any(|ddx| (-6i32..=6).any(|ddy|
                    self.grid.get(ox2 as i32 + ddx, oy2 as i32 + ddy) == Tile::Food));
                if !food_nearby && self.tick_count - last_think_m >= 8000 {
                    let kin_count = self.organisms.iter()
                        .filter(|o| o.alive && o.lineage_id == my_lid).count();
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "migration".to_string(),
                        kin_count,
                        energy_avg: self.organisms[idx].energy,
                        context:    format!("season={} food_scarce=true", season_now),
                        ..Default::default()
                    });
                }
            }

            // ── Invention trigger — at most once per 5000 ticks, only when prerequisites met ──
            if self.tick_count - self.organisms[idx].last_invention_tick >= 5000
               && self.organisms[idx].age > 400
            {
                let disc = &self.organisms[idx].discoveries;
                let candidates = invention_candidates(disc);
                if !candidates.is_empty() {
                    self.organisms[idx].last_invention_tick = self.tick_count;
                    let disc_vec: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                    let life_top: Vec<String> = self.organisms[idx].life_log.iter()
                        .rev().take(3).cloned().collect();
                    self.pending_thinks.push(ThinkTrigger {
                        org_id:      self.organisms[idx].id.clone(),
                        org_name:    self.organisms[idx].name.clone(),
                        lineage_id:  my_lid.clone(),
                        scenario:    "invention".to_string(),
                        discoveries: disc_vec,
                        life_log_top: life_top,
                        context:     candidates.join(", "),
                        ..Default::default()
                    });
                }
            }

            // ── Reflection — once per lifetime, at night, age > 800 ────────────────
            if night && !self.organisms[idx].has_reflected
               && self.organisms[idx].age > 800
               && self.organisms[idx].life_log.len() >= 4
            {
                self.organisms[idx].has_reflected = true;
                let life_top: Vec<String> = self.organisms[idx].life_log.iter()
                    .take(5).cloned().collect();
                let org = &self.organisms[idx];
                let emotional = format!("fear={:.1} comfort={:.1} lonely={:.1}",
                    org.fear_level, org.comfort, org.loneliness);
                self.pending_thinks.push(ThinkTrigger {
                    org_id:          org.id.clone(),
                    org_name:        org.name.clone(),
                    lineage_id:      org.lineage_id.clone(),
                    scenario:        "reflection".to_string(),
                    life_log_top:    life_top,
                    emotional_state: emotional,
                    ..Default::default()
                });
            }
        }

        // Food sharing: well-fed organism actively feeds starving kin nearby
        if self.organisms[idx].energy > 0.82
           && self.tick_count - self.organisms[idx].last_fed_kin >= 180
        {
            social::share_food(idx, &mut self.organisms, self.tick_count, &mut self.events);
        }

        // Elder teaching: elders periodically impart knowledge to young kin
        if self.organisms[idx].is_elder && self.tick_count % 60 == 0 {
            social::teach(idx, &mut self.organisms, self.tick_count, &mut self.events, &mut self.rng);
        }

        // Comfort nesting: update home toward current shelter when thriving
        {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let org = &self.organisms[idx];
            if org.health > 0.7 && org.energy > 0.55 && self.tick_count % 80 == 0
               && org.near_shelter(&self.grid) && self.rng.gen::<f32>() < 0.06
            {
                let (ox2, oy2) = (org.x, org.y);
                self.organisms[idx].home_x = ox2;
                self.organisms[idx].home_y = oy2;
            }
        }

        // Personality drift: traits slowly adapt to lived experience (every 2000 ticks)
        if self.tick_count % 2000 == (idx as u64 % 2000) {
            let org = &mut self.organisms[idx];
            if org.danger_memory.len() > 15 {
                org.traits.aggression = (org.traits.aggression + 0.005).min(1.0);
                org.traits.fear       = (org.traits.fear       + 0.003).min(1.0);
            }
            let social_success = org.lineage_attitudes.values().filter(|&&v| v > 0.3).count();
            if social_success >= 2 {
                org.traits.social_tendency = (org.traits.social_tendency + 0.005).min(1.0);
            }
            if org.food_memory.len() > 20 {
                org.traits.curiosity = (org.traits.curiosity + 0.003).min(1.0);
            }
            if org.health < 0.4 {
                org.traits.resilience = (org.traits.resilience + 0.004).min(1.0);
            }
        }

        // Seasonal migration pressure: in scarcity seasons, push toward known food sources farther out
        let season = self.season();
        if matches!(season, "winter" | "dry") {
            let (ox2, oy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_near = (-8i32..=8).any(|ddx| (-8i32..=8).any(|ddy|
                self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near && self.organisms[idx].food_memory.len() < 8
               && self.rng.gen::<f32>() < 0.0015
            {
                // Set a distant food-memory target or a random distant wander
                if self.organisms[idx].wander_target.is_none() && self.organisms[idx].energy > 0.4 {
                    let hash = self.tick_count ^ idx as u64;
                    let tx = (ox2 + ((hash % 40) as i32 - 20)).max(5).min(195);
                    let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).max(5).min(95);
                    self.organisms[idx].wander_target = Some((tx, ty));
                    self.organisms[idx].think("migrating for food", self.tick_count);
                }
            }
        }

        // Illness AI think trigger
        {
            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].infection > 0.5 && self.tick_count - last_think >= 3000 {
                self.organisms[idx].last_think_tick = self.tick_count;
                let energy = self.organisms[idx].energy;
                let lid    = self.organisms[idx].lineage_id.clone();
                self.pending_thinks.push(ThinkTrigger {
                    org_id:     self.organisms[idx].id.clone(),
                    org_name:   self.organisms[idx].name.clone(),
                    lineage_id: lid,
                    scenario:   "illness".to_string(),
                    energy_avg: energy,
                    context:    format!("infection={:.0}%", self.organisms[idx].infection * 100.0),
                    ..Default::default()
                });
            }
        }

        // ── Attraction / bonding / mating ────────────────────────────────────
        // Clear dead partner reference
        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let dead = !self.organisms.iter().any(|o| o.alive && &o.id == pid);
            if dead { self.organisms[idx].partner_id = None; }
        }
        // Clear attraction if target is gone/partnered
        if let Some(ref aid) = self.organisms[idx].attracted_to.clone() {
            let gone = !self.organisms.iter().any(|o|
                o.alive && &o.id == aid && o.partner_id.is_none()
            );
            if gone { self.organisms[idx].attracted_to = None; }
        }

        let tc = self.tick_count;
        let is_unpartnered_adult = self.organisms[idx].partner_id.is_none()
            && self.organisms[idx].alive
            && self.organisms[idx].age > 1500
            && self.organisms[idx].traits.social_tendency > 0.20;

        // Partner seeking: lonely unpartnered adults actively walk toward the nearest
        // potential mate rather than relying on random wandering to bring them together.
        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.organisms[idx].wander_target.is_none()
            && self.organisms[idx].loneliness > 0.30
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let target = self.organisms.iter()
                .filter(|o| o.alive && o.sex != my_sex && o.age > 1500 && o.partner_id.is_none())
                .min_by_key(|o| ((o.x - ox).hypot(o.y - oy) * 10.0) as i32)
                .map(|o| (o.x as i32, o.y as i32));
            if let Some((tx, ty)) = target {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        // Phase 1 — develop attraction toward a nearby opposite-sex adult
        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.rng.gen::<f32>() < 0.005
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let candidate = self.organisms.iter().enumerate().find(|(i, o)| {
                *i != idx && o.alive && o.partner_id.is_none()
                    && o.attracted_to.is_none()
                    && o.age > 1500
                    && o.sex != my_sex
                    && (o.x - ox).hypot(o.y - oy) < 35.0
            }).map(|(i, _)| i);
            if let Some(ci) = candidate {
                let cid   = self.organisms[ci].id.clone();
                let cname = self.organisms[ci].name.clone();
                let my_id = self.organisms[idx].id.clone();
                self.organisms[idx].attracted_to    = Some(cid.clone());
                self.organisms[idx].attraction_tick = tc;
                self.organisms[ci].attracted_to     = Some(my_id);
                self.organisms[ci].attraction_tick  = tc;
                self.organisms[idx].think(&format!("drawn to {}", cname), tc);
            }
        }

        // Phase 2 — if attracted and close enough long enough, bond + first convo
        if is_unpartnered_adult {
            let attracted_to = self.organisms[idx].attracted_to.clone();
            if let Some(ref aid) = attracted_to {
                let aid = aid.clone();
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let attraction_age = tc.saturating_sub(self.organisms[idx].attraction_tick);
                let partner_close = self.organisms.iter()
                    .any(|o| o.alive && o.id == aid && (o.x - ox).hypot(o.y - oy) < 8.0);
                if partner_close && attraction_age >= 300 && self.rng.gen::<f32>() < 0.04 {
                    if let Some(pi) = self.organisms.iter().position(|o| o.alive && o.id == aid) {
                        let pid   = self.organisms[pi].id.clone();
                        let pname = self.organisms[pi].name.clone();
                        let oid   = self.organisms[idx].id.clone();
                        let oname = self.organisms[idx].name.clone();
                        let (conv_a, conv_b) = courtship::generate_conversation(
                            &self.organisms[idx], &self.organisms[pi],
                            tc, "courtship", &mut self.rng,
                        );
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.organisms[idx].partner_id   = Some(pid.clone());
                        self.organisms[idx].attracted_to = None;
                        self.organisms[pi].partner_id    = Some(oid);
                        self.organisms[pi].attracted_to  = None;
                        self.organisms[idx].think(&format!("fell for {}", pname), tc);
                        self.organisms[idx].log_event(format!("bonded with {}", pname));
                        self.organisms[pi].log_event(format!("bonded with {}", oname));
                    }
                }
            }
        }

        // Periodic bonded conversation — ~once per 3000 ticks when near partner
        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let pid = pid.clone();
            if tc % 19 == (idx as u64 % 19) && self.rng.gen::<f32>() < 0.0018 {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                if let Some(pi) = self.organisms.iter().position(|o| o.alive && o.id == pid) {
                    if (self.organisms[pi].x - ox).hypot(self.organisms[pi].y - oy) < 8.0 {
                        let (conv_a, conv_b) = courtship::generate_conversation(
                            &self.organisms[idx], &self.organisms[pi],
                            tc, "bonded", &mut self.rng,
                        );
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                    }
                }
            }
        }

        // ── Casual conversation — any two nearby organisms ────────────────────
        // Chat when close enough; hostile pairs argue, happy pairs share excitement
        {
            let spread_check = tc % 29 == (idx as u64 % 29);
            if spread_check {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                // Find the closest alive non-partner organism within 6 tiles
                let chat_target: Option<usize> = {
                    let partner_id = self.organisms[idx].partner_id.clone();
                    self.organisms.iter().enumerate()
                        .filter(|(i, o)| *i != idx && o.alive
                            && partner_id.as_deref() != Some(&o.id)
                            && (o.x - ox).hypot(o.y - oy) < 6.0)
                        .min_by(|(_, a), (_, b)| {
                            let da = (a.x - ox).hypot(a.y - oy);
                            let db = (b.x - ox).hypot(b.y - oy);
                            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                        })
                        .map(|(i, _)| i)
                };
                if let Some(ci) = chat_target {
                    let their_lid = self.organisms[ci].lineage_id.clone();
                    let att = self.organisms[idx].attitude_toward(&their_lid);
                    // Kind determined by relationship + combined energy
                    let combined_energy = self.organisms[idx].energy + self.organisms[ci].energy;
                    let kind = if att < -0.3 {
                        "argue"
                    } else if combined_energy > 1.5 && att >= 0.0 {
                        "excited"
                    } else {
                        "chat"
                    };
                    // Probability: ~once per 5800 ticks per organism (~every 3 in-game days)
                    if self.rng.gen::<f32>() < 0.004 {
                        let (conv_a, conv_b) = courtship::generate_conversation(
                            &self.organisms[idx], &self.organisms[ci],
                            tc, kind, &mut self.rng,
                        );
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[ci].store_conversation(conv_b);
                    }
                }
            }
        }

        growth::try_reproduce(idx, &mut self.organisms, &self.grid,
                              self.tick_count, &mut self.events, &mut self.history,
                              &mut self.rng, alive_count);

        // ── Death check ───────────────────────────────────────────────────────
        // Capture death info before marking dead, for grief propagation below
        let death_grief: Option<(i32, i32, String)> = {
            let org = &self.organisms[idx];
            let dying = org.energy <= 0.0 || org.hydration <= 0.0 || org.health <= 0.0
                || (org.max_age > 0 && org.age >= org.max_age);
            if dying { Some((org.x as i32, org.y as i32, org.lineage_id.clone())) } else { None }
        };

        let org = &mut self.organisms[idx];
        if org.energy <= 0.0 || org.hydration <= 0.0 || org.health <= 0.0 {
            org.alive = false;
            org.think("dying", self.tick_count);
            let cause = if org.health <= 0.0 && org.infection > 0.3 {
                self.history.deaths_sickness += 1; "sickness"
            } else if org.energy <= 0.0 {
                self.history.deaths_starvation += 1; "starvation"
            } else if org.hydration <= 0.0 {
                self.history.deaths_dehydration += 1; "dehydration"
            } else {
                self.history.deaths_combat += 1; "combat"
            };
            let msg = format!("gen{} age {} — {}", org.generation, org.age, cause);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        } else if org.max_age > 0 && org.age >= org.max_age {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            let msg = format!("gen{} age {} — old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        // ── Grief — nearby kin witness death, mourn, and gather ──────────────
        if let Some((dx, dy, dlid)) = death_grief {
            let dead_name = self.organisms[idx].name.clone();
            let grievers: Vec<usize> = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == dlid)
                .filter(|(_, o)| (o.x as i32 - dx).abs() + (o.y as i32 - dy).abs() <= 12)
                .map(|(i, _)| i)
                .collect();

            let griever_count = grievers.len();
            for gi in &grievers {
                let ms = self.organisms[*gi].traits.memory_strength;
                Organism::remember(&mut self.organisms[*gi].danger_memory, dx, dy, 0.65, ms);
                self.organisms[*gi].fear_level    = (self.organisms[*gi].fear_level + 0.22).min(1.0);
                self.organisms[*gi].grief_ticks   = 80 + self.rng.gen_range(0u32..40);
                self.organisms[*gi].think("mourning kin", self.tick_count);
            }

            if griever_count >= 2 {
                push_event(&mut self.events, self.tick_count, "mourn", &dead_name,
                           &format!("{} kin gather to mourn", griever_count));
            }

            // Grief AI think trigger for the eldest griever
            if let Some(&gi) = grievers.first() {
                let energy = self.organisms[gi].energy;
                let lid    = self.organisms[gi].lineage_id.clone();
                self.pending_thinks.push(ThinkTrigger {
                    org_id:     self.organisms[gi].id.clone(),
                    org_name:   self.organisms[gi].name.clone(),
                    lineage_id: lid,
                    scenario:   "grief".to_string(),
                    energy_avg: energy,
                    context:    format!("lost {} — {} kin mourn", dead_name, griever_count),
                    ..Default::default()
                });
            }

            // Death leaves a terrain scar — the land itself remembers violence and suffering
            self.grid.add_hazard(dx, dy, 0.45);
            self.grid.reduce_fertility(dx, dy, 0.08); // death degrades the soil temporarily
            // Inner ring
            for (ndx, ndy) in [(-1i32,0),(1,0),(0,-1i32),(0,1)] {
                self.grid.add_hazard(dx+ndx, dy+ndy, 0.18);
                self.grid.reduce_fertility(dx+ndx, dy+ndy, 0.03);
            }
            // Outer ring (weaker — organisms sense danger from farther away)
            for ddx in -2i32..=2 { for ddy in -2i32..=2 {
                if ddx.abs() + ddy.abs() == 2 {
                    self.grid.add_hazard(dx+ddx, dy+ddy, 0.06);
                }
            }}

            // Scavenging: death site has a small chance of leaving food (reality of nature)
            if self.rng.gen::<f32>() < 0.25 {
                if matches!(self.grid.get(dx, dy), Tile::Grass | Tile::Ash) {
                    self.grid.set(dx, dy, Tile::Food);
                }
            }
        }
    }

    // ── Animals ───────────────────────────────────────────────────────────────

    fn spawn_animals(&mut self, count: usize) {
        for _ in 0..count {
            let kind = if self.rng.gen::<f32>() < 0.7 { AnimalKind::Rabbit } else { AnimalKind::Deer };
            for _ in 0..60 {
                let x = self.rng.gen_range(3..(WIDTH as i32 - 3)) as f32;
                let y = self.rng.gen_range(3..(HEIGHT as i32 - 3)) as f32;
                if !matches!(self.grid.get(x as i32, y as i32),
                             Tile::Void | Tile::Rock | Tile::Water | Tile::Fire) {
                    let id = self.next_animal_id;
                    self.next_animal_id += 1;
                    self.animals.push(Animal::new(id, x, y, kind));
                    break;
                }
            }
        }
    }

    fn tick_animals(&mut self) {
        let org_pos: Vec<(f32, f32)> = self.organisms.iter()
            .filter(|o| o.alive)
            .map(|o| (o.x, o.y))
            .collect();

        for animal in &mut self.animals {
            animal.tick(&self.grid, &org_pos, &mut self.rng);
        }

        // Reproduction
        let alive = self.animals.iter().filter(|a| a.alive).count();
        if alive < 50 {
            let candidates: Vec<(usize, f32, f32, AnimalKind)> = self.animals.iter()
                .filter(|a| a.alive && a.energy > 0.70
                         && self.tick_count.saturating_sub(a.last_reproduced) > 800)
                .map(|a| (a.id, a.x, a.y, a.kind))
                .collect();
            for (pid, px, py, kind) in candidates {
                if self.rng.gen::<f32>() < 0.0008
                   && self.animals.iter().filter(|a| a.alive).count() < 50
                {
                    let nid = self.next_animal_id;
                    self.next_animal_id += 1;
                    let ox = self.rng.gen_range(-3.0..3.0f32);
                    let oy = self.rng.gen_range(-3.0..3.0f32);
                    let nx = (px + ox).max(1.0).min(WIDTH as f32 - 2.0);
                    let ny = (py + oy).max(1.0).min(HEIGHT as f32 - 2.0);
                    self.animals.push(Animal::new(nid, nx, ny, kind));
                    if let Some(p) = self.animals.iter_mut().find(|a| a.id == pid) {
                        p.last_reproduced = self.tick_count;
                    }
                }
            }
        }

        self.animals.retain(|a| a.alive);

        // Respawn if too few
        let alive = self.animals.iter().filter(|a| a.alive).count();
        if alive < 12 {
            self.spawn_animals(10);
        }
    }

    fn check_animal_catches(&mut self) {
        // Collect (org_idx, animal_idx) where they're adjacent
        let mut to_catch: Vec<(usize, usize)> = Vec::new();
        for (oi, org) in self.organisms.iter().enumerate() {
            if !org.alive { continue; }
            let (ox, oy) = (org.x as i32, org.y as i32);
            for (ai, animal) in self.animals.iter().enumerate() {
                if !animal.alive { continue; }
                let (ax, ay) = (animal.x as i32, animal.y as i32);
                if (ox - ax).abs() <= 1 && (oy - ay).abs() <= 1 {
                    let base_p = match animal.kind {
                        AnimalKind::Rabbit => 0.28,
                        AnimalKind::Deer   => 0.14,
                    };
                    if self.rng.gen::<f32>() < base_p + org.traits.aggression * 0.18 {
                        to_catch.push((oi, ai));
                    }
                }
            }
        }

        // Apply catches — each animal caught once (first hunter wins)
        let mut caught: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for (oi, ai) in to_catch {
            if caught.contains(&ai) { continue; }
            caught.insert(ai);
            let (kind, boost) = match self.animals[ai].kind {
                AnimalKind::Rabbit => ("rabbit", 0.30),
                AnimalKind::Deer   => ("deer",   0.55),
            };
            let (ax, ay) = (self.animals[ai].x as i32, self.animals[ai].y as i32);
            self.animals[ai].alive = false;
            let ms = self.organisms[oi].traits.memory_strength;
            let has_tools = self.organisms[oi].discoveries.contains("stone_tools")
                || self.organisms[oi].discoveries.contains("spear");
            let tool_bonus = if has_tools { 0.10 } else { 0.0 };
            // Pack hunting: 3+ kin within 5 tiles = coordinated group hunt
            let pack_kin = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id == self.organisms[oi].lineage_id)
                .filter(|o| (o.x - self.organisms[oi].x).abs() + (o.y - self.organisms[oi].y).abs() <= 5.0)
                .count().saturating_sub(1);
            let pack_bonus = if pack_kin >= 3 { 0.14 } else if pack_kin >= 1 { 0.06 } else { 0.0 };
            if pack_kin >= 2 {
                let name = self.organisms[oi].name.clone();
                push_event(&mut self.events, self.tick_count, "hunt", &name,
                           &format!("pack hunt: {} kin ({} {})", pack_kin, kind, if pack_kin >= 3 { "coordinated!" } else { "helped" }));
            }
            self.organisms[oi].energy = (self.organisms[oi].energy + boost + tool_bonus + pack_bonus).min(1.0);
            self.organisms[oi].think("hunting", self.tick_count);
            self.organisms[oi].log_event(format!("hunted a {} at ({},{})", kind, ax, ay));
            self.organisms[oi].discover("hunt");
            // Remember this tile as a good hunting ground (food memory)
            Organism::remember(&mut self.organisms[oi].food_memory, ax, ay, 0.65, ms);
        }

        self.animals.retain(|a| a.alive);
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────

    fn broadcast_discovery(&mut self, actor_idx: usize, x: i32, y: i32,
                           rtype: &str, radius: i32) {
        let (ax, ay) = (self.organisms[actor_idx].x, self.organisms[actor_idx].y);
        for i in 0..self.organisms.len() {
            if i == actor_idx || !self.organisms[i].alive { continue; }
            let dist = ((self.organisms[i].x - ax).abs() + (self.organisms[i].y - ay).abs()) as i32;
            if dist > radius { continue; }
            let strength = 0.25 * (1.0 - dist as f32 / radius as f32);
            let ms = self.organisms[i].traits.memory_strength;
            match rtype {
                "food"   => Organism::remember(&mut self.organisms[i].food_memory,   x, y, strength, ms),
                "water"  => Organism::remember(&mut self.organisms[i].water_memory,  x, y, strength, ms),
                "danger" => Organism::remember(&mut self.organisms[i].danger_memory, x, y, strength, ms),
                _ => {}
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    pub fn is_night(&self) -> bool {
        (self.tick_count % DAY_LENGTH) >= (DAY_LENGTH as f64 * 0.7) as u64
    }

    pub fn season(&self) -> &'static str {
        SEASONS[(self.tick_count / SEASON_LENGTH) as usize % 4]
    }

    pub fn season_progress(&self) -> f32 {
        (self.tick_count % SEASON_LENGTH) as f32 / SEASON_LENGTH as f32
    }

    fn compute_era(&self) -> String {
        let alive = self.organisms.iter().filter(|o| o.alive).count();
        if alive == 0 { return "extinction".to_string(); }
        let food_tiles = self.grid.tiles.iter().filter(|&&t| t == Tile::Food as i8).count();
        let food_per_cap = food_tiles as f32 / alive.max(1) as f32;
        let pop_trend = if self.pop_history.len() >= 5 {
            let recent = self.pop_history[self.pop_history.len()-1][1] as f32;
            let older  = self.pop_history[self.pop_history.len()-5][1] as f32;
            (recent - older) / (older + 1.0)
        } else { 0.0 };
        if alive < 6                                   { return "collapse".to_string(); }
        if self.drought.active && food_per_cap < 2.0   { return "drought".to_string(); }
        if food_per_cap > 14.0 && pop_trend > 0.08    { return "abundance".to_string(); }
        if food_per_cap < 2.5  && pop_trend < -0.05   { return "collapse".to_string(); }
        if pop_trend > 0.12                            { return "expansion".to_string(); }
        if pop_trend < -0.08                           { return "decline".to_string(); }
        "equilibrium".to_string()
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    pub fn save(&self, path: &str) {
        let state = SaveState {
            tick_count:     self.tick_count,
            next_animal_id: self.next_animal_id,
            history:        self.history.clone(),
            drought: DroughtSave {
                active:      self.drought.active,
                start_tick:  self.drought.start_tick,
                dried_tiles: self.drought.dried_tiles.iter().map(|&(x,y)| [x,y]).collect(),
                rain_relief: self.drought.rain_relief,
            },
            weather: WeatherSave {
                kind:       self.weather.kind,
                start_tick: self.weather.start_tick,
                duration:   self.weather.duration,
                intensity:  self.weather.intensity,
            },
            pop_history:   self.pop_history.iter().cloned().collect(),
            events:    self.events.iter().cloned().collect(),
            organisms:     self.organisms.iter().map(org_to_save).collect(),
            animals:       self.animals.iter().map(animal_to_save).collect(),
            story_history: self.story_history.iter().cloned().collect(),
            grid: GridSave {
                tiles:       self.grid.tiles.clone(),
                fire:        self.grid.fire_intensity.clone(),
                food_trail:  self.grid.food_trail.clone(),
                water_trail: self.grid.water_trail.clone(),
                path_trail:  self.grid.path_trail.clone(),
                structure:   self.grid.structure.clone(),
                fertility:   self.grid.fertility.clone(),
                hazard:      self.grid.hazard.clone(),
                pressure:    self.grid.pressure.clone(),
            },
            current_era:    self.current_era.clone(),
            sex_words:      self.sex_words.to_vec(),
            world_seed:     self.world_seed,
            lineage_names:  self.lineage_names.clone(),
        };
        if let Ok(json) = serde_json::to_string(&state) {
            std::fs::write(path, json).ok();
        }
    }

    pub fn load_or_new(seed: u64, path: &str) -> Self {
        if let Ok(data) = std::fs::read_to_string(path) {
            if let Ok(state) = serde_json::from_str::<SaveState>(&data) {
                println!("Loaded world from {} (tick {})", path, state.tick_count);
                // Reuse the original world seed so terrain/depth stay consistent
                let terrain_seed = if state.world_seed > 0 { state.world_seed } else { seed };
                return Self::from_save(terrain_seed, state);
            }
        }
        println!("Starting fresh world");
        Self::new(seed)
    }

    fn from_save(seed: u64, state: SaveState) -> Self {
        use rand::SeedableRng;
        let expected = WIDTH * HEIGHT;
        let mut grid = WorldGrid::new(seed);
        // If the saved grid doesn't match current dimensions, keep the freshly generated one
        if state.grid.tiles.len() == expected {
            grid.tiles          = state.grid.tiles;
            grid.fire_intensity = state.grid.fire;
            grid.food_trail     = state.grid.food_trail;
            grid.water_trail    = state.grid.water_trail;
            grid.path_trail     = state.grid.path_trail;
            if !state.grid.structure.is_empty() && state.grid.structure.len() == expected {
                grid.structure = state.grid.structure;
            }
            if !state.grid.fertility.is_empty() && state.grid.fertility.len() == expected {
                grid.fertility = state.grid.fertility;
            }
            if !state.grid.hazard.is_empty() && state.grid.hazard.len() == expected {
                grid.hazard = state.grid.hazard;
            }
            if !state.grid.pressure.is_empty() && state.grid.pressure.len() == expected {
                grid.pressure = state.grid.pressure;
            }
        } else {
            println!("Save grid size mismatch (got {}, need {}) — regenerating world", state.grid.tiles.len(), expected);
        }

        let drought = DroughtState {
            active:      state.drought.active,
            start_tick:  state.drought.start_tick,
            dried_tiles: state.drought.dried_tiles.into_iter().map(|[x,y]| (x,y)).collect(),
            rain_relief: state.drought.rain_relief,
        };

        // Spread out think/invention cooldowns so a restart doesn't burst-fire every trigger at once
        let tick = state.tick_count;
        let mut organisms: Vec<_> = state.organisms.into_iter().map(org_from_save).collect();
        {
            use rand::Rng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(seed ^ tick ^ 0xdeadbeef);
            for org in &mut organisms {
                if tick.saturating_sub(org.last_think_tick) >= 4000 {
                    org.last_think_tick = tick - rng.gen_range(0..4000);
                }
                if tick.saturating_sub(org.last_invention_tick) >= 5000 {
                    org.last_invention_tick = tick - rng.gen_range(0..5000);
                }
                // Clamp positions to current world bounds (handles dimension changes on load)
                org.x = org.x.clamp(1.0, WIDTH as f32 - 2.0);
                org.y = org.y.clamp(1.0, HEIGHT as f32 - 2.0);
            }
        }

        // Rebuild hotsets BEFORE moving grid into the struct literal
        let active_structure_tiles: HashSet<(i32, i32)> = {
            let mut hs = HashSet::new();
            for y in 0..crate::world::grid::HEIGHT as i32 {
                for x in 0..crate::world::grid::WIDTH as i32 {
                    if grid.structure_at(x, y) > 0.0 { hs.insert((x, y)); }
                }
            }
            hs
        };
        let mut physics = PhysicsEngine::new();
        // Rebuild fire hotset from loaded grid
        for y in 0..crate::world::grid::HEIGHT as i32 {
            for x in 0..crate::world::grid::WIDTH as i32 {
                if matches!(grid.get(x, y), Tile::Fire | Tile::Campfire) {
                    physics.register_fire(x, y);
                }
            }
        }

        Simulation {
            grid,
            physics,
            organisms,
            animals:              state.animals.into_iter().map(animal_from_save).collect(),
            tick_count:           state.tick_count,
            events:               state.events.into_iter().collect(),
            history:              state.history,
            drought,
            weather: WeatherState {
                kind:       state.weather.kind,
                start_tick: state.weather.start_tick,
                duration:   state.weather.duration,
                intensity:  state.weather.intensity,
            },
            flood_tiles:            Vec::new(),
            story_history:          state.story_history.into_iter().collect(),
            pending_thinks:         Vec::new(),
            lineage_strategies:     HashMap::new(),
            lineage_last_council:   HashMap::new(),
            lineage_elders:         HashMap::new(),
            lineage_negotiations:   HashMap::new(),
            pop_history:            state.pop_history.into_iter().collect(),
            current_era:            if state.current_era.is_empty() { "genesis".to_string() } else { state.current_era },
            sex_words: {
                // Restore saved words, or regenerate from seed if save predates this feature
                if state.sex_words.len() >= 2 {
                    [state.sex_words[0].clone(), state.sex_words[1].clone()]
                } else {
                    use crate::organism::vocabulary::gen_phoneme_word;
                    use rand::SeedableRng;
                    let mut word_rng = rand::rngs::SmallRng::seed_from_u64(seed.wrapping_add(0xc0ffee));
                    let w0 = gen_phoneme_word(&mut word_rng);
                    let mut w1 = gen_phoneme_word(&mut word_rng);
                    while w1 == w0 { w1 = gen_phoneme_word(&mut word_rng); }
                    [w0, w1]
                }
            },
            world_seed:             seed,  // already resolved to original seed in load_or_new
            next_animal_id:         state.next_animal_id,
            lineage_names:          state.lineage_names,
            rng:                    rand::rngs::SmallRng::seed_from_u64(seed ^ state.tick_count),
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes:    serde_json::Value::Array(vec![]),
            slow_compute_tick:       0,
            active_structure_tiles,
        }
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    // Centroid-following version (used for initial WS snapshot)
    pub fn state_json(&mut self) -> serde_json::Value {
        let alive: Vec<_> = self.organisms.iter().filter(|o| o.alive).collect();
        let (cx, cy) = if alive.is_empty() {
            (crate::world::grid::WIDTH as i32 / 2, crate::world::grid::HEIGHT as i32 / 2)
        } else {
            let n = alive.len() as f32;
            ((alive.iter().map(|o| o.x).sum::<f32>() / n) as i32,
             (alive.iter().map(|o| o.y).sum::<f32>() / n) as i32)
        };
        self.state_json_at(cx, cy)
    }

    // Explicit viewport center — called from main loop with client-supplied position
    pub fn state_json_at(&mut self, vp_cx: i32, vp_cy: i32) -> serde_json::Value {
        use serde_json::json;

        // ── Throttled slow-path computations (every 60 ticks ≈ 18 s) ─────────
        // tribal_relations and lineage_sizes are O(organisms × lineages).
        // Results are cached; stale values are fine — tribes don't flip allegiance
        // tick-to-tick and users don't need sub-second lineage panel updates.
        let needs_slow = self.tick_count == 0
            || self.tick_count.saturating_sub(self.slow_compute_tick) >= 60;
        if needs_slow {
            let alive_lineages: std::collections::HashSet<String> = self.organisms.iter()
                .filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect();

            // Tribal relations — use full lineage_id so frontend can look up tribe names
            let mut att_totals: HashMap<(String, String), (f32, u32)> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                for (other_lid, &att) in &org.lineage_attitudes {
                    if alive_lineages.contains(other_lid) {
                        let key = if org.lineage_id < *other_lid {
                            (org.lineage_id.clone(), other_lid.clone())
                        } else {
                            (other_lid.clone(), org.lineage_id.clone())
                        };
                        let e = att_totals.entry(key).or_insert((0.0, 0));
                        e.0 += att; e.1 += 1;
                    }
                }
            }
            self.cached_tribal_relations = serde_json::to_value(
                att_totals.into_iter()
                    .filter(|(_, (_, cnt))| *cnt > 0)
                    .map(|((a, b), (sum, cnt))| {
                        let avg = sum / cnt as f32;
                        let status = if avg > 0.3 { "ally" } else if avg < -0.3 { "rivals" } else { "neutral" };
                        // Use full lineage_id as key so frontend can resolve tribe names
                        json!({ "a": a, "b": b,
                                 "attitude": (avg * 100.0).round() / 100.0, "status": status })
                    }).collect::<Vec<_>>()
            ).unwrap();

            // Lineage sizes
            let mut lineage_sizes: HashMap<String, usize> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                *lineage_sizes.entry(org.lineage_id.clone()).or_insert(0) += 1;
            }
            self.cached_lineage_sizes = serde_json::to_value(
                lineage_sizes.into_iter()
                    .map(|(id, count)| json!({"id": id, "count": count}))
                    .collect::<Vec<_>>()
            ).unwrap();

            self.slow_compute_tick = self.tick_count;
        }

        // Stagger expensive static grid layers to cap per-tick payload size
        let include_tiles  = self.tick_count % 5  == 0 || self.tick_count <= 1;
        let include_static = self.tick_count % 30 == 0 || self.tick_count <= 1;
        let grid_json = self.grid.to_json_viewport(vp_cx, vp_cy,
            crate::world::grid::VP_W, crate::world::grid::VP_H,
            include_tiles, include_static);

        json!({
            "tick":            self.tick_count,
            "grid":            serde_json::to_value(grid_json).unwrap(),
            "organisms":       self.organisms.iter().filter(|o| o.alive).map(|o| serde_json::to_value(o.to_json()).unwrap()).collect::<Vec<_>>(),
            "animals":         self.animals.iter().map(|a| serde_json::to_value(a.to_json()).unwrap()).collect::<Vec<_>>(),
            "events":          serde_json::to_value(&self.events).unwrap(),
            "is_day":          !self.is_night(),
            "day_progress":    ((self.tick_count % DAY_LENGTH) as f32 / DAY_LENGTH as f32 * 1000.0).round() / 1000.0,
            "season":          self.season(),
            "season_progress": (self.season_progress() * 1000.0).round() / 1000.0,
            "drought":         self.drought.active,
            "weather":         { "kind": self.weather.kind_str(), "intensity": self.weather.intensity },
            "history":         serde_json::to_value(&self.history).unwrap(),
            "story_history":   serde_json::to_value(
                self.story_history.iter().rev().take(120).collect::<Vec<_>>()
            ).unwrap(),
            "pop_history":     serde_json::to_value(&self.pop_history).unwrap(),
            "tribal_relations": &self.cached_tribal_relations,
            "lineage_sizes":    &self.cached_lineage_sizes,
            "lineage_names":    serde_json::to_value(&self.lineage_names).unwrap(),
            "current_era":      &self.current_era,
            "sex_words":        &self.sex_words,
        })
    }
}

// ── Persistence types ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct GridSave {
    tiles:       Vec<i8>,
    fire:        Vec<f32>,
    food_trail:  Vec<f32>,
    water_trail: Vec<f32>,
    path_trail:  Vec<f32>,
    #[serde(default)]
    structure:   Vec<f32>,
    #[serde(default)]
    fertility:   Vec<f32>,
    #[serde(default)]
    hazard:      Vec<f32>,
    #[serde(default)]
    pressure:    Vec<f32>,
}

#[derive(Serialize, Deserialize)]
struct DroughtSave {
    active:      bool,
    start_tick:  u64,
    dried_tiles: Vec<[i32; 2]>,
    #[serde(default)]
    rain_relief: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct WeatherSave {
    kind:       u8,
    start_tick: u64,
    duration:   u64,
    intensity:  f32,
}

#[derive(Serialize, Deserialize)]
struct OrgSave {
    id: String, name: String,
    x: f32, y: f32,
    energy: f32, hydration: f32, health: f32,
    age: u32, alive: bool,
    thought: String,
    generation: u32, parent_id: String, lineage_id: String, max_age: u32,
    food_memory:   HashMap<String, f32>,
    water_memory:  HashMap<String, f32>,
    danger_memory: HashMap<String, f32>,
    thought_history:    Vec<crate::organism::organism::ThoughtEntry>,
    q_table:            HashMap<String, Vec<f32>>,
    last_reproduced: u64, last_challenged: u64,
    lineage_attitudes:  HashMap<String, f32>,
    org_trust:          HashMap<String, f32>,
    traits:      crate::organism::traits::Traits,
    infection:   f32, carrying: u32,
    #[serde(default)]
    carrying_type: u8,
    vocabulary:  crate::organism::vocabulary::Vocabulary,
    daily_story: String,
    last_story_tick: u64,
    #[serde(default)]
    life_log: Vec<String>,
    #[serde(default)]
    discoveries: Vec<String>,
    #[serde(default)]
    home_x: f32,
    #[serde(default)]
    home_y: f32,
    #[serde(default)]
    has_reflected: bool,
    #[serde(default)]
    last_invention_tick: u64,
    #[serde(default)]
    last_think_tick: u64,
    #[serde(default)]
    partner_id: Option<String>,
    #[serde(default)]
    children_count: u32,
    #[serde(default)]
    sex: String,
    #[serde(default)]
    attracted_to: Option<String>,
    #[serde(default)]
    attraction_tick: u64,
    #[serde(default)]
    pregnant: bool,
    #[serde(default)]
    pregnancy_start: u64,
    #[serde(default)]
    conversations: Vec<crate::organism::organism::ConversationEntry>,
    #[serde(default)]
    father_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct AnimalSave {
    id: usize, x: f32, y: f32, alive: bool, energy: f32,
    kind: u8,
    last_reproduced: u64,
}

#[derive(Serialize, Deserialize)]
struct SaveState {
    tick_count:     u64,
    next_animal_id: usize,
    history:        History,
    drought:        DroughtSave,
    #[serde(default)]
    weather:        WeatherSave,
    events:         Vec<Event>,
    organisms:      Vec<OrgSave>,
    animals:        Vec<AnimalSave>,
    grid:           GridSave,
    #[serde(default)]
    story_history:  Vec<StoryEntry>,
    #[serde(default)]
    pop_history:    Vec<[u64; 2]>,
    #[serde(default)]
    current_era:    String,
    #[serde(default)]
    sex_words:      Vec<String>,  // [0]=Male word, [1]=Female word
    #[serde(default)]
    world_seed:     u64,          // terrain seed — reuse on load so depth map stays consistent
    #[serde(default)]
    lineage_names:  HashMap<String, String>,  // lineage_id → tribe name
}

fn mem_encode(m: &HashMap<(i32,i32), f32>) -> HashMap<String, f32> {
    m.iter().map(|(&(x,y), &v)| (format!("{},{}", x, y), v)).collect()
}

fn mem_decode(m: HashMap<String, f32>) -> HashMap<(i32,i32), f32> {
    m.into_iter().filter_map(|(k, v)| {
        let mut parts = k.splitn(2, ',');
        let x = parts.next()?.parse::<i32>().ok()?;
        let y = parts.next()?.parse::<i32>().ok()?;
        Some(((x, y), v))
    }).collect()
}

fn org_to_save(o: &Organism) -> OrgSave {
    OrgSave {
        id: o.id.clone(), name: o.name.clone(),
        x: o.x, y: o.y,
        energy: o.energy, hydration: o.hydration, health: o.health,
        age: o.age, alive: o.alive,
        thought: o.thought.clone(),
        generation: o.generation, parent_id: o.parent_id.clone(),
        lineage_id: o.lineage_id.clone(), max_age: o.max_age,
        food_memory:   mem_encode(&o.food_memory),
        water_memory:  mem_encode(&o.water_memory),
        danger_memory: mem_encode(&o.danger_memory),
        thought_history:   o.thought_history.iter().cloned().collect(),
        q_table:           o.q_table.clone(),
        last_reproduced:   o.last_reproduced, last_challenged: o.last_challenged,
        lineage_attitudes: o.lineage_attitudes.clone(),
        org_trust:         o.org_trust.clone(),
        traits:      o.traits.clone(),
        infection:   o.infection, carrying: o.carrying,
        carrying_type: o.carrying_type,
        vocabulary:  o.vocabulary.clone(),
        daily_story: o.daily_story.clone(),
        last_story_tick: o.last_story_tick,
        life_log: o.life_log.iter().cloned().collect(),
        discoveries: o.discoveries.iter().cloned().collect(),
        home_x: o.home_x,
        home_y: o.home_y,
        has_reflected:       o.has_reflected,
        last_invention_tick: o.last_invention_tick,
        last_think_tick:     o.last_think_tick,
        partner_id:          o.partner_id.clone(),
        children_count:      o.children_count,
        sex:                 o.sex.as_str().to_string(),
        attracted_to:        o.attracted_to.clone(),
        attraction_tick:     o.attraction_tick,
        pregnant:            o.pregnant,
        pregnancy_start:     o.pregnancy_start,
        conversations:       o.conversations.iter().cloned().collect(),
        father_id:           o.father_id.clone(),
    }
}

fn org_from_save(s: OrgSave) -> Organism {
    use crate::organism::organism::Organism;
    // Compute vocab seed before s.id / s.lineage_id are moved into Organism::new
    let vocab_seed = {
        let lid_seed = s.lineage_id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let id_seed  = s.id.bytes().fold(0u64, |a, b| a.wrapping_add(b as u64));
        lid_seed ^ id_seed
    };
    let needs_vocab = s.vocabulary.words.is_empty();
    let saved_vocab = s.vocabulary;
    let mut o = Organism::new(
        s.id, s.name, s.x, s.y,
        s.generation, s.parent_id, s.lineage_id,
        s.max_age, s.traits,
    );
    o.energy    = s.energy;
    o.hydration = s.hydration;
    o.health    = s.health;
    o.age       = s.age;
    o.alive     = s.alive;
    o.thought   = s.thought;
    o.food_memory   = mem_decode(s.food_memory);
    o.water_memory  = mem_decode(s.water_memory);
    o.danger_memory = mem_decode(s.danger_memory);
    o.thought_history    = s.thought_history.into_iter().collect();
    o.q_table            = s.q_table;
    o.last_reproduced    = s.last_reproduced;
    o.last_challenged    = s.last_challenged;
    o.lineage_attitudes  = s.lineage_attitudes;
    o.org_trust          = s.org_trust;
    o.infection       = s.infection;
    o.carrying        = s.carrying;
    o.carrying_type   = s.carrying_type;
    o.daily_story     = s.daily_story;
    o.last_story_tick = s.last_story_tick;
    o.life_log        = s.life_log.into_iter().collect();
    o.discoveries     = s.discoveries.into_iter().collect();
    if s.home_x != 0.0 || s.home_y != 0.0 {
        o.home_x = s.home_x;
        o.home_y = s.home_y;
    }
    o.has_reflected       = s.has_reflected;
    o.last_invention_tick = s.last_invention_tick;
    o.last_think_tick     = s.last_think_tick;
    o.partner_id          = s.partner_id;
    o.children_count      = s.children_count;
    o.sex                 = crate::organism::organism::Sex::from_str(&s.sex);
    o.attracted_to        = s.attracted_to;
    o.attraction_tick     = s.attraction_tick;
    o.pregnant            = s.pregnant;
    o.pregnancy_start     = s.pregnancy_start;
    o.conversations       = s.conversations.into_iter().collect();
    o.father_id           = s.father_id;
    if needs_vocab {
        use rand::SeedableRng;
        let mut voc_rng = rand::rngs::SmallRng::seed_from_u64(vocab_seed);
        o.vocabulary = crate::organism::vocabulary::Vocabulary::generate(&mut voc_rng);
    } else {
        o.vocabulary = saved_vocab;
    }
    o
}

fn animal_to_save(a: &Animal) -> AnimalSave {
    AnimalSave {
        id: a.id, x: a.x, y: a.y, alive: a.alive, energy: a.energy,
        kind: if a.kind == AnimalKind::Rabbit { 0 } else { 1 },
        last_reproduced: a.last_reproduced,
    }
}

fn animal_from_save(s: AnimalSave) -> Animal {
    let mut a = Animal::new(s.id, s.x, s.y,
        if s.kind == 0 { AnimalKind::Rabbit } else { AnimalKind::Deer });
    a.alive           = s.alive;
    a.energy          = s.energy;
    a.last_reproduced = s.last_reproduced;
    a
}
