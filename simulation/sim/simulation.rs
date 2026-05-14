use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Serialize, Deserialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io;
use crate::organism::organism::{Organism, DIRECTIONS, generate_tribe_name};
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::{grid::{WorldGrid, TrailKind, WIDTH, HEIGHT}, tiles::Tile};
use crate::physics::engine::PhysicsEngine;
use super::config::{DAY_LENGTH, SEASON_LENGTH, SEASONS, season_growth};
use super::world_events::{DroughtState, WeatherState, tick_drought, tick_outbreak, tick_weather, tick_world_evolution, push_event};
use super::{social, growth, courtship};
use super::spatial::SpatialIndex;

pub const SAVE_SCHEMA_VERSION: u32 = 2;

// ── Public types ─────────────────────────────────────────────────────────────

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StoryEntry {
    pub tick:       u64,
    pub org_name:   String,
    pub lineage_id: String,
    pub story:      String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
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
    // Organism traits - used by local resolver to make classification decisions
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
            // Middle-of-the-road defaults - push sites set these to real values
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

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Event {
    pub tick:   u64,
    #[serde(rename = "type")]
    pub etype:  String,
    pub actor:  String,
    pub detail: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
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
    pub(crate) lineage_last_council: HashMap<String, u64>,
    pub(crate) lineage_elders:       HashMap<String, String>,
    pub(crate) lineage_negotiations: HashMap<(String,String), u64>,
    pub pop_history:           VecDeque<[u64; 2]>,
    // Lineage centroid history. One sample (tick, cx, cy) per lineage per
    // sim-day (every 600 ticks), capped at 60 samples (~2 sim-months) per
    // lineage. Foundation for regional oral history and historical-geography
    // UI - a tribe that's drifted 200 tiles across its lifetime can have
    // that drift visualised as a trail.
    pub lineage_centroid_history: HashMap<String, VecDeque<[i32; 3]>>,
    pub current_era:           String,
    pub sex_words:             [String; 2],  // [0]=word for Male, [1]=word for Female - coined by founding generation
    pub world_seed:            u64,          // seed used for this world's terrain - persisted so depth/elevation reload correctly
    pub(crate) next_animal_id: usize,
    pub(crate) rng:            ChaCha8Rng,
    pub last_immigration_tick: u64,
    // ── Throttled-computation cache ─────────────────────────────────────────
    // These are derived from organism data; not saved, recomputed every N ticks.
    pub(crate) cached_tribal_relations: serde_json::Value,
    pub(crate) cached_lineage_sizes:    serde_json::Value,
    pub(crate) slow_compute_tick:       u64,
    // ── Hot-set for non-zero structure tiles ───────────────────────────────
    pub(crate) active_structure_tiles: HashSet<(i32, i32)>,
    // ── Emergent settlement tiers ──────────────────────────────────────────
    // lineage_id → highest settlement tier reached (0=none .. 5=city).
    // Derived from clustered structure tiles; not saved, recomputed.
    pub(crate) settlement_tiers: HashMap<String, u8>,
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

fn scarcity_driven_migration_season(season: &str) -> bool {
    matches!(season, "scarcity" | "decline")
}

impl Simulation {
    pub fn new(seed: u64) -> Self {
        let rng  = ChaCha8Rng::seed_from_u64(seed);
        let grid = WorldGrid::new(seed);
        let physics = PhysicsEngine::new();

        // Generate the two sex-category words from organism phoneme pool.
        // The founding generation "coins" these - they are the culture's own names.
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
            lineage_centroid_history: HashMap::new(),
            current_era: "genesis".to_string(),
            sex_words,
            world_seed: seed,
            next_animal_id: 0,
            rng,
            last_immigration_tick:   0,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes:    serde_json::Value::Array(vec![]),
            slow_compute_tick:       0,
            active_structure_tiles:  HashSet::new(),
            settlement_tiers:        HashMap::new(),
        };
        sim.spawn_founders();
        sim.spawn_animals(14);
        sim
    }

    fn push_think_for(&mut self, org_idx: usize, trigger: ThinkTrigger) {
        self.pending_thinks.push(trigger.with_traits(&self.organisms[org_idx]));
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    pub fn tick(&mut self) {
        self.tick_count += 1;

        let season = self.season();
        self.physics.growth_mult = season_growth(season);

        if self.tick_count % 5 == 0 {
            self.physics.tick(&mut self.grid, &mut self.rng, self.weather.kind);
        }

        // Clear daily life-log at dawn (dawn/dusk/season no longer pushed to event buffer
        // - they crowded out real events since dawn fires every 3 min real-time)
        let phase = self.tick_count % DAY_LENGTH;
        if phase == 0 {
            for org in &mut self.organisms {
                org.life_log.clear();
            }
        }

        // Collect event/history refs via pointer gymnastics - easiest to just clone when needed
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

        // World memory layer decay - fertility recovers, hazard & pressure fade
        if self.tick_count % 500 == 0 {
            self.grid.decay_world_layers();
        }

        // World era detection - track historical periods
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

        // Emergent settlement growth - clustered structures become camps,
        // hamlets, villages, towns and cities as a lineage builds up.
        if self.tick_count % 1200 == 600 {
            self.tick_settlements();
        }

        // Pregnancy deliveries - check every tick for due mothers
        growth::deliver_births(&mut self.organisms, self.tick_count,
                               &mut self.events, &mut self.history);

        // Track population once per in-world day
        if self.tick_count % DAY_LENGTH == 0 {
            let alive = self.organisms.iter().filter(|o| o.alive).count() as u64;
            self.pop_history.push_back([self.tick_count, alive]);
            if self.pop_history.len() > 1000 { self.pop_history.pop_front(); }
            self.sample_lineage_centroids();
        }

        // Regional oral history. Every ~60 ticks, scan a few random orgs
        // for proximity to an OLD centroid of their own lineage. If an
        // org wanders within a few tiles of where their tribe lived
        // many generations ago, set a thought - the world feels lived-in
        // when a passing org thinks "this was our grandparents' camp".
        if self.tick_count % 60 == 0 && !self.lineage_centroid_history.is_empty() {
            self.tick_ancestral_recognition();
        }

        // ── Elder recomputation ───────────────────────────────────────────────
        // The oldest living organism per lineage is the elder - tribal memory keeper.
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

        // Per-lineage alive counts, computed once per tick. Birth decisions
        // consult this to enforce a per-lineage population cap (see
        // growth::try_reproduce). O(N) once is cheaper than O(N) inside
        // every per-organism reproduction check.
        let mut lineage_counts: HashMap<String, usize> = HashMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            *lineage_counts.entry(o.lineage_id.clone()).or_insert(0) += 1;
        }

        // Recovery from a crashed world. Previously immigration only
        // kicked in below 50 alive on a 300-tick cooldown, which left
        // a "dead zone" at 50-80 where the world flatlined: too few
        // breeding adults to grow naturally, too many alive to trigger
        // fresh immigrants. Two tiers now:
        //   - <60 alive: aggressive, every 200 ticks (~20s wall). The
        //     world is collapsing - flood it with young new tribes.
        //   - <100 alive: gentle, every 600 ticks (~60s wall). The
        //     world is greying - keep a trickle of new tribes so the
        //     age pyramid doesn't get top-heavy.
        let immig_cooldown = if alive_count_before_loop < 60 {
            Some(200u64)
        } else if alive_count_before_loop < 100 {
            Some(600u64)
        } else {
            None
        };
        if let Some(cd) = immig_cooldown {
            if self.tick_count - self.last_immigration_tick >= cd {
                self.spawn_immigrant_tribe();
                self.last_immigration_tick = self.tick_count;
            }
        }

        // Build a spatial index over current organism positions once per tick.
        // Per-organism proximity scans (kin_near, hostile_near, crowding, etc.) then run
        // in O(neighbours_in_bucket) instead of O(N) per call. Bucket size 10 is a good
        // fit for the radius-5-to-12 queries we do - most lookups touch a 3×3 block.
        let spatial = SpatialIndex::build(&self.organisms, 10);
        for i in 0..self.organisms.len() {
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                self.tick_organism(i, alive_count_before_loop, &lineage_counts, &spatial);

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
                                    self.push_think_for(epos, ThinkTrigger {
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

        // Update smoothed per-organism velocities for the WS lookahead
        // projection. Exponential moving average so transient
        // jitter (find-best-move flip-flops) doesn't make positions
        // shimmy in the rendered frame, and so a sudden teleport
        // (fork, immigrant spawn) decays naturally over the next few
        // ticks instead of locking in a huge predicted velocity.
        // Clamp to a sane per-tick max - real organisms move <2 tiles
        // per tick under any circumstance; anything larger is a
        // teleport and should not project forward.
        const VEL_EMA_ALPHA: f32 = 0.4;
        const MAX_PER_TICK:  f32 = 2.0;
        for o in self.organisms.iter_mut() {
            if !o.alive { continue; }
            let inst_vx = o.x - o.prev_x;
            let inst_vy = o.y - o.prev_y;
            o.prev_x = o.x;
            o.prev_y = o.y;
            if inst_vx.abs() > MAX_PER_TICK || inst_vy.abs() > MAX_PER_TICK {
                // Teleport detected - reset velocity to zero so the
                // lookahead doesn't fling the org across the map.
                o.vx_smooth = 0.0;
                o.vy_smooth = 0.0;
                continue;
            }
            o.vx_smooth = VEL_EMA_ALPHA * inst_vx + (1.0 - VEL_EMA_ALPHA) * o.vx_smooth;
            o.vy_smooth = VEL_EMA_ALPHA * inst_vy + (1.0 - VEL_EMA_ALPHA) * o.vy_smooth;
        }

        // Genealogy-preserving archive policy.
        // The most recent ~300 dead organisms keep their full state so the UI
        // can show their memories, q-tables, life logs, etc. Older dead are
        // compressed - heavy fields cleared but the skeleton (id, name,
        // lineage_id, parent_id, father_id, generation, traits, age, max_age)
        // is preserved so the family tree and lineage archaeology remain intact.
        // After ~10000 compressed, the oldest are hard-deleted to bound RAM.
        if self.tick_count % 1200 == 0 {
            // Step 1: compress dead beyond the recent window
            let dead_count = self.organisms.iter().filter(|o| !o.alive).count();
            const RECENT_DEAD_FULL: usize = 300;
            const MAX_ARCHIVE: usize       = 10_000;
            if dead_count > RECENT_DEAD_FULL {
                let to_compress = dead_count - RECENT_DEAD_FULL;
                let mut compressed = 0usize;
                // Compress oldest-first (front of vec). Skip already-compressed
                // organisms (q_table empty == previously compressed).
                for o in self.organisms.iter_mut() {
                    if compressed >= to_compress { break; }
                    if !o.alive && !o.q_table.is_empty() {
                        o.compress_for_archive();
                        compressed += 1;
                    }
                }
            }
            // Step 2: hard-delete only when the archive itself overflows
            let dead_now = self.organisms.iter().filter(|o| !o.alive).count();
            if dead_now > MAX_ARCHIVE {
                let excess = dead_now - MAX_ARCHIVE;
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

    fn tick_organism(&mut self, idx: usize, alive_count: usize,
                     lineage_counts: &HashMap<String, usize>,
                     spatial: &SpatialIndex) {
        let night   = self.is_night();
        let epsilon = (0.5 - self.organisms[idx].age as f32 * 0.00008).max(0.12);

        let prev_energy    = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;

        // ── Inner emotional state ─────────────────────────────────────────────
        {
            let org = &self.organisms[idx];
            // Spatial-indexed kin scan: O(bucket) instead of O(N)
            let kin_near = spatial.query(org.x as i32, org.y as i32, 5)
                .into_iter()
                .filter(|&i| {
                    if i == idx { return false; }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == org.lineage_id
                        && (o.x - org.x).abs() + (o.y - org.y).abs() <= 5.0
                })
                .count();
            let (ox2, oy2) = (org.x as i32, org.y as i32);
            let near_shelter = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| {
                let nx = ox2 + dx; let ny = oy2 + dy;
                matches!(self.grid.get(nx, ny), Tile::Hut | Tile::Rock)
                    || self.grid.structure_at(nx, ny) >= 0.35
            }));
            let hostile_near = spatial.query(org.x as i32, org.y as i32, 6)
                .into_iter()
                .any(|i| {
                    if i == idx { return false; }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id != org.lineage_id
                        && (o.x - org.x).abs() + (o.y - org.y).abs() <= 6.0
                        && org.attitude_toward(&o.lineage_id) < -0.2
                });
            let weather_kind = self.weather.kind;
            let tick_now = self.tick_count;
            self.organisms[idx].tick_inner_state(kin_near, near_shelter, hostile_near, weather_kind, tick_now, night);
        }

        // ── Territory defense - organisms near their elder's home grow hostile toward intruders ──
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
        self.validate_or_assign_wander_target(idx);

        let hungry = self.organisms[idx].energy < 0.55;
        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let prey_nearby = if hungry {
            self.animals.iter()
                .filter(|a| a.alive && !matches!(a.kind, AnimalKind::Wolf))
                .map(|a| ((a.x - ox).abs() + (a.y - oy).abs(), a.x, a.y))
                .filter(|&(d, _, _)| d <= 6.0)
                .min_by(|(a,_,_),(b,_,_)| a.partial_cmp(b).unwrap())
        } else {
            None
        };

        let (action, new_thought): (usize, Option<String>) = if let Some((_, ax, ay)) = prey_nearby {
            let dx = (ax - ox).signum();
            let dy = (ay - oy).signum();
            let dir = match (dx as i32, dy as i32) {
                ( 0, -1) => 0, ( 0,  1) => 1, (-1,  0) => 2, ( 1,  0) => 3,
                (-1, -1) => 4, ( 1, -1) => 5, (-1,  1) => 6, ( 1,  1) => 7,
                _        => 3,
            };
            (dir, Some("stalking prey".to_string()))
        } else {
            self.organisms[idx].choose_action(
                &self.grid, self.tick_count, epsilon, &self.organisms, night,
                self.weather.kind, &mut self.rng, animal_near, &perception)
        };
        if let Some(t) = new_thought {
            self.organisms[idx].think(&t, self.tick_count);
        }

        let (ix, iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);

        let mut signal_reward = 0.0f32;

        if action < 8 {
            let (dx, dy) = DIRECTIONS[action];
            let (nx, ny) = (ix + dx, iy + dy);
            let next_tile = self.grid.get(nx, ny);
            if next_tile.walkable() {
                self.organisms[idx].x = nx as f32;
                self.organisms[idx].y = ny as f32;
                self.grid.leave_trail(nx, ny, TrailKind::Path, 0.06);
                self.grid.stamp_pressure(nx, ny);
                // Farmers passively cultivate parched land they walk through
                let has_farming = self.organisms[idx].discoveries.contains("farm");
                if has_farming {
                    let fidx = WorldGrid::idx(nx, ny);
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
                self.organisms[idx].hydration = 1.0;
                let room = self.organisms[idx].carry_room();
                let fill = room.min(4) as u8;
                self.organisms[idx].inv_water = self.organisms[idx].inv_water.saturating_add(fill);
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
                        self.push_think_for(idx, ThinkTrigger {
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
            // Gather materials - stone from Rock adjacency, wood/organic otherwise
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
            // Light a campfire - only organic/wood fuel works, not stone
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
                    self.push_think_for(idx, ThinkTrigger {
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
        } else if action == 18 {
            // DIG: break open the ground. In sand it can strike water;
            // on soil it loosens and enriches the earth for future food.
            let tile = self.grid.get(ix, iy);
            match tile {
                Tile::Sand => {
                    if self.rng.gen::<f32>() < 0.06 {
                        self.grid.set(ix, iy, Tile::Water);
                        signal_reward += 0.08;
                        let name = self.organisms[idx].name.clone();
                        self.organisms[idx].think("struck water", self.tick_count);
                        self.organisms[idx].log_event(format!("dug a well at ({},{})", ix, iy));
                        push_event(&mut self.events, self.tick_count, "build", &name, "dug a well");
                        if self.organisms[idx].discover("well") {
                            push_event(&mut self.events, self.tick_count, "build", &name, "discovered well-digging");
                        }
                    } else {
                        self.organisms[idx].think("digging in the sand", self.tick_count);
                        signal_reward += 0.001;
                    }
                }
                Tile::Grass | Tile::Ash => {
                    let fi = WorldGrid::idx(ix, iy);
                    if self.grid.fertility[fi] < 0.85 {
                        self.grid.fertility[fi] = (self.grid.fertility[fi] + 0.03).min(0.9);
                        signal_reward += 0.004;
                        self.organisms[idx].think("tilling the soil", self.tick_count);
                    }
                }
                _ => {}
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.004).max(0.0);
        } else if action == 19 {
            // FORAGE: comb the brush for wild food. Fertile ground yields more.
            let fi = WorldGrid::idx(ix, iy);
            let fert = self.grid.fertility[fi];
            if matches!(self.grid.get(ix, iy), Tile::Grass)
                && self.rng.gen::<f32>() < 0.10 + fert * 0.18
            {
                self.grid.set(ix, iy, Tile::Food);
                self.grid.reduce_fertility(ix, iy, 0.03);
                signal_reward += 0.02;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("foraging wild food", self.tick_count);
                self.organisms[idx].log_event(format!("foraged wild food at ({},{})", ix, iy));
                if self.organisms[idx].discover("foraging") {
                    push_event(&mut self.events, self.tick_count, "build", &name, "learned to forage");
                }
            } else {
                self.organisms[idx].think("searching the brush", self.tick_count);
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.003).max(0.0);
        } else if action == 20 {
            // DANCE: a social ritual that lifts the spirits of nearby kin.
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let kin: Vec<usize> = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 5.0)
                .map(|(i, _)| i).collect();
            if !kin.is_empty() {
                for &ki in &kin {
                    self.organisms[ki].loneliness = (self.organisms[ki].loneliness - 0.10).max(0.0);
                    self.organisms[ki].boredom    = (self.organisms[ki].boredom - 0.12).max(0.0);
                    self.organisms[ki].comfort    = (self.organisms[ki].comfort + 0.06).min(1.0);
                }
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.15).max(0.0);
                signal_reward += 0.006 * kin.len().min(5) as f32;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("dancing with kin", self.tick_count);
                push_event(&mut self.events, self.tick_count, "social", &name, "led a dance");
                if self.organisms[idx].discover("dance") {
                    push_event(&mut self.events, self.tick_count, "social", &name, "invented dance");
                }
            } else {
                self.organisms[idx].think("dancing alone", self.tick_count);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
            }
        } else if action == 21 {
            // SING: carry a vocabulary word on the air; listeners absorb it
            // and are soothed.
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_vocab = self.organisms[idx].vocabulary.clone();
            let listeners: Vec<usize> = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
                .map(|(i, _)| i).collect();
            for &li in &listeners {
                self.organisms[li].vocabulary.absorb_from(&my_vocab, &mut self.rng);
                self.organisms[li].fear_level = (self.organisms[li].fear_level - 0.05).max(0.0);
                self.organisms[li].comfort    = (self.organisms[li].comfort + 0.03).min(1.0);
            }
            self.organisms[idx].think("singing", self.tick_count);
            if !listeners.is_empty() {
                signal_reward += 0.004 * listeners.len().min(6) as f32;
                let name = self.organisms[idx].name.clone();
                if self.organisms[idx].discover("song") {
                    push_event(&mut self.events, self.tick_count, "social", &name, "sang the first song");
                }
            }
        } else if action == 22 {
            // REFLECT: a quiet moment that settles fear, grief and boredom.
            let o = &mut self.organisms[idx];
            o.fear_level = (o.fear_level - 0.06).max(0.0);
            o.boredom    = (o.boredom - 0.04).max(0.0);
            o.sleep_debt = (o.sleep_debt - 0.03).max(0.0);
            o.comfort    = (o.comfort + 0.04).min(1.0);
            if o.grief_ticks > 0 { o.grief_ticks = o.grief_ticks.saturating_sub(2); }
            o.think("reflecting quietly", self.tick_count);
            signal_reward += 0.002;
        } else if action == 23 {
            // STOCKPILE: carry food away from the tile to eat later.
            if self.grid.get(ix, iy) == Tile::Food && self.organisms[idx].carry_room() > 0 {
                self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                self.grid.set(ix, iy, Tile::Grass);
                self.grid.reduce_fertility(ix, iy, 0.05);
                signal_reward += 0.01;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("storing food", self.tick_count);
                if self.organisms[idx].discover("food stores") {
                    push_event(&mut self.events, self.tick_count, "build", &name, "began storing food");
                }
            }
        } else if action == 24 {
            // SCOUT: study the surroundings, committing resources to memory.
            let ms = self.organisms[idx].traits.memory_strength;
            let mut found = 0;
            for dx in -10..=10 {
                for dy in -10..=10 {
                    match self.grid.get(ix + dx, iy + dy) {
                        Tile::Food => {
                            Organism::remember(&mut self.organisms[idx].food_memory, ix+dx, iy+dy, 0.6, ms);
                            found += 1;
                        }
                        Tile::Water => {
                            Organism::remember(&mut self.organisms[idx].water_memory, ix+dx, iy+dy, 0.6, ms);
                            found += 1;
                        }
                        _ => {}
                    }
                }
            }
            self.organisms[idx].think("scouting the area", self.tick_count);
            if found > 0 { signal_reward += 0.003; }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.002).max(0.0);
        } else if action == 25 {
            // MARK TERRITORY: lay a strong trail and a small structural marker.
            self.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
            self.grid.add_structure(ix, iy, 0.02);
            self.active_structure_tiles.insert((ix, iy));
            self.organisms[idx].think("marking territory", self.tick_count);
            signal_reward += 0.002;
        } else if action >= 26 {
            // Extended action set (26..=125) - see sim/extended_actions.rs
            signal_reward += self.apply_extended_action(idx, action, ix, iy);
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
        // No "build" intent - shelter emerges from where they live with their load.
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
                    // Shelter discovery fires at crude-shelter threshold - more achievable
                    if self.organisms[idx].discover("shelter") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "understood shelter");
                        let lid = self.organisms[idx].lineage_id.clone();
                        self.push_think_for(idx, ThinkTrigger {
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
            // (Applied as a negative to the drain that happens below - we note this here
            //  and account for it by not re-draining the recovered amount)

            // Health regeneration - shelter lets the body heal even when not perfectly nourished
            let health_regen = 0.0006 + shelter_strength * 0.0010;
            self.organisms[idx].health = (self.organisms[idx].health + health_regen).min(1.0);

            // Infection clearance boost - dry, safe environment fights sickness
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

        }

        // ── Vital drain ───────────────────────────────────────────────────────
        // Shelter reduces metabolic energy drain (warmth, rest, protection from elements).
        // Hydration is unaffected - organisms still need water regardless of shelter.
        let shelter_drain_mult = if shelter_strength > 0.0 {
            (1.0 - shelter_strength * 0.35).max(0.65)
        } else {
            1.0
        };
        let mut water_near = false;
        'wn: for ddx in -4i32..=4 {
            for ddy in -4i32..=4 {
                if self.grid.get(cx + ddx, cy + ddy) == Tile::Water { water_near = true; break 'wn; }
            }
        }
        let hydration_mult = if water_near { 0.5 } else { 1.0 };

        self.organisms[idx].energy    = (self.organisms[idx].energy    - 0.0022 * shelter_drain_mult).max(0.0);
        self.organisms[idx].hydration = (self.organisms[idx].hydration - 0.0014 * hydration_mult).max(0.0);

        // Auto-sip from canteen when parched. One unit per ~30s of thirst.
        if self.organisms[idx].hydration < 0.55 && self.organisms[idx].inv_water > 0
            && self.tick_count % 8 == 0
        {
            self.organisms[idx].inv_water -= 1;
            self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.18).min(1.0);
        }

        // Auto-eat from stored food when hungry - the payoff for stockpiling.
        if self.organisms[idx].energy < 0.45 && self.organisms[idx].inv_food > 0
            && self.tick_count % 6 == 0
        {
            self.organisms[idx].inv_food -= 1;
            self.organisms[idx].energy = (self.organisms[idx].energy + 0.30).min(1.0);
            self.organisms[idx].think("eating stored food", self.tick_count);
        }
        self.apply_water_fatigue(idx, cx, cy);
        if night {
            let has_torch = self.organisms[idx].discoveries.contains("torch");
            // Shelter also halves night cold-drain - a roof keeps warmth in
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
            // Extreme heat also drains hydration faster - but shade helps
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

        // ── Passive kin water sharing ─────────────────────────────────────────
        // The canteen analogue of food sharing - an organism with full
        // canteens slips a sip to a parched same-lineage neighbour.
        if self.organisms[idx].inv_water >= 2 && self.tick_count % 7 == (idx as u64 % 7) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.hydration < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| a.1.hydration.partial_cmp(&b.1.hydration).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].inv_water -= 1;
                self.organisms[ri].hydration = (self.organisms[ri].hydration + 0.22).min(1.0);
                self.organisms[idx].think("sharing water", self.tick_count);
                self.organisms[ri].think("watered by kin", self.tick_count);
                self.history.gifts_total += 1;
            }
        }

        // ── Firelight storytelling ────────────────────────────────────────────
        // At night near a campfire, kin exchange memory hints with each
        // other. Real human behaviour: the campfire is where the tribe
        // pools knowledge of where water flows, where game grazes, where
        // the predator passed. Much weaker than the elder-teach pathway
        // and limited to one exchange per organism per tick.
        if night && self.tick_count % 17 == (idx as u64 % 17) {
            let (sx, sy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-2i32..=2).any(|ddx| (-2i32..=2).any(|ddy| {
                matches!(self.grid.get(sx + ddx, sy + ddy), Tile::Campfire | Tile::Fire)
            }));
            if near_fire {
                let lid = self.organisms[idx].lineage_id.clone();
                let (fx, fy) = (self.organisms[idx].x, self.organisms[idx].y);
                let listener = self.organisms.iter().enumerate()
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.age < 1800)
                    .filter(|(_, o)| (o.x - fx).abs() + (o.y - fy).abs() < 3.5)
                    .min_by_key(|(_, o)| o.age)
                    .map(|(i, _)| i);
                if let Some(li) = listener {
                    let ms = self.organisms[li].traits.memory_strength;
                    let food_hints: Vec<((i32,i32), f32)> = self.organisms[idx].food_memory.iter()
                        .filter(|(_, &v)| v > 0.5).take(2).map(|(&k, &v)| (k, v)).collect();
                    let water_hints: Vec<((i32,i32), f32)> = self.organisms[idx].water_memory.iter()
                        .filter(|(_, &v)| v > 0.5).take(2).map(|(&k, &v)| (k, v)).collect();
                    for ((x, y), v) in food_hints  { Organism::remember(&mut self.organisms[li].food_memory,  x, y, v * 0.3, ms); }
                    for ((x, y), v) in water_hints { Organism::remember(&mut self.organisms[li].water_memory, x, y, v * 0.3, ms); }
                    self.organisms[li].think("listening by the fire", self.tick_count);
                }
            }
        }

        // ── Passive kin food sharing ──────────────────────────────────────────
        // When a well-fed organism stands within two tiles of a kin who's
        // about to starve, slip them a portion. This is what a real human
        // tribe does at the margin - the strong feed the weak. Capped to
        // one transfer per tick and gated on the donor's reserves so the
        // donor doesn't tank their own survival.
        if self.organisms[idx].energy > 0.75 && self.tick_count % 5 == (idx as u64 % 5) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.energy < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| a.1.energy.partial_cmp(&b.1.energy).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].energy = (self.organisms[idx].energy - 0.10).max(0.40);
                self.organisms[ri].energy = (self.organisms[ri].energy + 0.16).min(1.0);
                let recipient_id = self.organisms[ri].id.clone();
                let donor_name = self.organisms[idx].name.clone();
                self.organisms[idx].think("sharing food", self.tick_count);
                self.organisms[ri].think("fed by kin", self.tick_count);
                let cur = self.organisms[idx].org_trust.get(&recipient_id).copied().unwrap_or(0.0);
                self.organisms[idx].org_trust.insert(recipient_id, (cur + 0.04).min(1.0));
                self.history.gifts_total += 1;
                if self.rng.gen::<f32>() < 0.10 {
                    push_event(&mut self.events, self.tick_count, "gift", &donor_name, "shared food with starving kin");
                }
            }
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

        // Background pathogen - wetlands amplify disease spread (stagnant water, humidity)
        {
            use crate::world::tiles::Biome;
            let biome = self.grid.biome_at(
                self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let pathogen_rate = match biome {
                Biome::Wetland => 0.00050, // 4× - disease swamps
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
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let spreaders: Vec<(f32, f32, f32)> = spatial.query(sx as i32, sy as i32, 2)
                .into_iter()
                .filter(|&i| {
                    if i == idx { return false; }
                    let o = &self.organisms[i];
                    o.alive && o.infection >= 0.15
                        && (o.x - sx).abs() + (o.y - sy).abs() <= 2.0
                })
                .map(|i| (self.organisms[i].infection, 0.0, 0.0))
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
        let kin_count = spatial.query(ox as i32, oy as i32, 4)
            .into_iter()
            .filter(|&i| {
                if i == idx { return false; }
                let o = &self.organisms[i];
                o.alive && o.lineage_id == lineage
                    && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .count();
        // Cap at 1 nearby kin for social reward - beyond that, no extra benefit
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

        // Crowding penalty - quadratic past 2, gets painful fast
        let crowding = spatial.query(ox as i32, oy as i32, 3)
            .into_iter()
            .filter(|&i| {
                if i == idx { return false; }
                let o = &self.organisms[i];
                o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
            })
            .count();
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

        // Inner-state reward modifiers - organisms feel the benefit of their actions
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
            let neighbour_idxs = spatial.query(ox as i32, oy as i32, 3);
            let nearby_kin = neighbour_idxs.iter().copied()
                .filter(|&i| {
                    if i == idx { return false; }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == lineage && (o.x-ox).abs()+(o.y-oy).abs() <= 3.0
                })
                .count();
            let nearby_stranger_count = neighbour_idxs.iter().copied()
                .filter(|&i| {
                    if i == idx { return false; }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id != lineage && (o.x-ox).abs()+(o.y-oy).abs() <= 3.0
                })
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
                self.push_think_for(idx, ThinkTrigger {
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

            // Council: 5+ well-fed kin nearby, throttled per lineage - elder speaks
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
                        // The elder speaks for the tribe - not a random member.
                        // age/gen are already encoded in elder_ctx; we only need name + ctx.
                        let (elder_name, elder_ctx) = {
                            if let Some(eid) = self.lineage_elders.get(&my_lid) {
                                let eid = eid.clone();
                                if let Some(e) = self.organisms.iter().find(|o| o.alive && o.id == eid) {
                                    let ctx = format!("age:{} gen:{} memories:{}",
                                        e.age, e.generation, e.danger_memory.len() + e.food_memory.len());
                                    (e.name.clone(), ctx)
                                } else {
                                    let o = &self.organisms[idx];
                                    (o.name.clone(), String::new())
                                }
                            } else {
                                let o = &self.organisms[idx];
                                (o.name.clone(), String::new())
                            }
                        };
                        self.lineage_last_council.insert(my_lid.clone(), self.tick_count);
                        self.push_think_for(idx, ThinkTrigger {
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

            // Individual directives - throttled per organism
            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 4000 {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy     = self.organisms[idx].energy;
                let hydration  = self.organisms[idx].hydration;

                // Survival crisis: both hungry AND thirsty
                if energy < 0.25 && hydration < 0.25 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(idx, ThinkTrigger {
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
                    self.push_think_for(idx, ThinkTrigger {
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
                        self.push_think_for(idx, ThinkTrigger {
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

            // Emotional triggers - separate throttle
            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 6000 {
                let loneliness = self.organisms[idx].loneliness;
                let boredom    = self.organisms[idx].boredom;
                let energy     = self.organisms[idx].energy;

                if loneliness > 0.78 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(idx, ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "lonely".to_string(),
                        energy_avg: energy,
                        ..Default::default()
                    });
                } else if boredom > 0.72 && energy > 0.75 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(idx, ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "restless".to_string(),
                        energy_avg: energy,
                        ..Default::default()
                    });
                }
            }

            // ── Migration pressure - seasonal food scarcity triggers relocation debate ─────
            let season_now = self.season();
            if scarcity_driven_migration_season(season_now) {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let last_think_m = self.organisms[idx].last_think_tick;
                let food_nearby = (-6i32..=6).any(|ddx| (-6i32..=6).any(|ddy|
                    self.grid.get(ox2 as i32 + ddx, oy2 as i32 + ddy) == Tile::Food));
                if !food_nearby && self.tick_count - last_think_m >= 8000 {
                    let kin_count = self.organisms.iter()
                        .filter(|o| o.alive && o.lineage_id == my_lid).count();
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(idx, ThinkTrigger {
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

            // ── Invention trigger - at most once per 5000 ticks, only when prerequisites met ──
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
                    self.push_think_for(idx, ThinkTrigger {
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

            // ── Reflection - once per lifetime, at night, age > 800 ────────────────
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
                self.push_think_for(idx, ThinkTrigger {
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
        if scarcity_driven_migration_season(season) {
            let (ox2, oy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_near = (-8i32..=8).any(|ddx| (-8i32..=8).any(|ddy|
                self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near && self.organisms[idx].food_memory.len() < 8
               && self.rng.gen::<f32>() < 0.0015
            {
                // Set a distant food-memory target or a random distant wander
                if self.organisms[idx].wander_target.is_none() && self.organisms[idx].energy > 0.4 {
                    let hash = self.tick_count ^ idx as u64;
                    let tx = (ox2 + ((hash % 40) as i32 - 20)).clamp(5, WIDTH as i32 - 5);
                    let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).clamp(5, HEIGHT as i32 - 5);
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
                self.push_think_for(idx, ThinkTrigger {
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
            && self.organisms[idx].age > 1000
            && self.organisms[idx].traits.social_tendency > 0.15;

        // Partner seeking: lonely unpartnered adults actively walk toward the nearest
        // potential mate rather than relying on random wandering to bring them together.
        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.organisms[idx].wander_target.is_none()
            && self.organisms[idx].loneliness > 0.20
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let target = self.organisms.iter()
                .filter(|o| o.alive && o.sex != my_sex && o.age > 1000 && o.partner_id.is_none())
                .min_by_key(|o| ((o.x - ox).hypot(o.y - oy) * 10.0) as i32)
                .map(|o| (o.x as i32, o.y as i32));
            if let Some((tx, ty)) = target {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        // Phase 1 - develop attraction toward a nearby opposite-sex adult
        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.rng.gen::<f32>() < 0.012
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let candidate = self.organisms.iter().enumerate().find(|(i, o)| {
                *i != idx && o.alive && o.partner_id.is_none()
                    && o.attracted_to.is_none()
                    && o.age > 1000
                    && o.sex != my_sex
                    && (o.x - ox).hypot(o.y - oy) < 120.0
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

        // Phase 2 - if attracted and close enough long enough, bond + first convo
        if is_unpartnered_adult {
            let attracted_to = self.organisms[idx].attracted_to.clone();
            if let Some(ref aid) = attracted_to {
                let aid = aid.clone();
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let attraction_age = tc.saturating_sub(self.organisms[idx].attraction_tick);
                let partner_close = self.organisms.iter()
                    .any(|o| o.alive && o.id == aid && (o.x - ox).hypot(o.y - oy) < 8.0);
                if partner_close && attraction_age >= 150 && self.rng.gen::<f32>() < 0.08 {
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

        // Periodic bonded conversation - ~once per 3000 ticks when near partner
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

        // ── Casual conversation - any two nearby organisms ────────────────────
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
                              &mut self.rng, alive_count, lineage_counts);

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
            let msg = format!("gen{} age {} - {}", org.generation, org.age, cause);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        } else if org.max_age > 0 && org.age >= org.max_age {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            let msg = format!("gen{} age {} - old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        // ── Grief - nearby kin witness death, mourn, and gather ──────────────
        if let Some((dx, dy, dlid)) = death_grief {
            let dead_name = self.organisms[idx].name.clone();
            let grievers: Vec<usize> = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == dlid)
                .filter(|(_, o)| (o.x as i32 - dx).abs() + (o.y as i32 - dy).abs() <= 12)
                .map(|(i, _)| i)
                .collect();

            let griever_count = grievers.len();

            // Pass the deceased's strongest food/water memories on to the
            // grieving kin. Real human bands carry the dead's knowledge
            // forward through retelling - "she always said the spring
            // was three ridges east". Each griever picks up a few of
            // the deceased's most-trusted memory tiles at reduced
            // strength. Without this, every death erases that person's
            // accumulated map of the world.
            let inherited_food: Vec<((i32, i32), f32)> = self.organisms[idx].food_memory.iter()
                .filter(|(_, &v)| v > 0.5).take(5).map(|(&k, &v)| (k, v)).collect();
            let inherited_water: Vec<((i32, i32), f32)> = self.organisms[idx].water_memory.iter()
                .filter(|(_, &v)| v > 0.5).take(5).map(|(&k, &v)| (k, v)).collect();
            let inherited_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();

            for gi in &grievers {
                let ms = self.organisms[*gi].traits.memory_strength;
                Organism::remember(&mut self.organisms[*gi].danger_memory, dx, dy, 0.65, ms);
                self.organisms[*gi].fear_level    = (self.organisms[*gi].fear_level + 0.22).min(1.0);
                self.organisms[*gi].grief_ticks   = 80 + self.rng.gen_range(0u32..40);
                self.organisms[*gi].think("mourning kin", self.tick_count);

                // Inherit a slice of the deceased's wisdom
                for &((mx, my), v) in &inherited_food {
                    Organism::remember(&mut self.organisms[*gi].food_memory, mx, my, v * 0.4, ms);
                }
                for &((mx, my), v) in &inherited_water {
                    Organism::remember(&mut self.organisms[*gi].water_memory, mx, my, v * 0.4, ms);
                }
                // Direct kin (partner / father / parent) also pick up rare
                // discoveries that hadn't yet spread - last-chance cultural
                // preservation.
                let is_direct_kin = self.organisms[*gi].partner_id.as_ref() == Some(&self.organisms[idx].id)
                    || self.organisms[*gi].parent_id == self.organisms[idx].id
                    || self.organisms[*gi].father_id.as_ref() == Some(&self.organisms[idx].id);
                if is_direct_kin {
                    for d in &inherited_disc {
                        if !self.organisms[*gi].discoveries.contains(d.as_str())
                            && self.rng.gen::<f32>() < 0.45
                        {
                            self.organisms[*gi].discoveries.insert(d.clone());
                        }
                    }
                }
            }

            if griever_count >= 2 {
                push_event(&mut self.events, self.tick_count, "mourn", &dead_name,
                           &format!("{} kin gather to mourn", griever_count));
            }

            // Grief AI think trigger for the eldest griever
            if let Some(&gi) = grievers.first() {
                let energy = self.organisms[gi].energy;
                let lid    = self.organisms[gi].lineage_id.clone();
                self.push_think_for(gi, ThinkTrigger {
                    org_id:     self.organisms[gi].id.clone(),
                    org_name:   self.organisms[gi].name.clone(),
                    lineage_id: lid,
                    scenario:   "grief".to_string(),
                    energy_avg: energy,
                    context:    format!("lost {} - {} kin mourn", dead_name, griever_count),
                    ..Default::default()
                });
            }

            // Death leaves a terrain scar - the land itself remembers violence and suffering
            self.grid.add_hazard(dx, dy, 0.45);
            self.grid.reduce_fertility(dx, dy, 0.08); // death degrades the soil temporarily
            // Inner ring
            for (ndx, ndy) in [(-1i32,0),(1,0),(0,-1i32),(0,1)] {
                self.grid.add_hazard(dx+ndx, dy+ndy, 0.18);
                self.grid.reduce_fertility(dx+ndx, dy+ndy, 0.03);
            }
            // Outer ring (weaker - organisms sense danger from farther away)
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
            let r = self.rng.gen::<f32>();
            let kind = if r < 0.32 { AnimalKind::Rabbit }
                       else if r < 0.55 { AnimalKind::Deer }
                       else if r < 0.70 { AnimalKind::Boar }
                       else if r < 0.84 { AnimalKind::Bird }
                       else if r < 0.92 { AnimalKind::Fish }
                       else                { AnimalKind::Wolf };
            for _ in 0..60 {
                let x = self.rng.gen_range(3..(WIDTH as i32 - 3)) as f32;
                let y = self.rng.gen_range(3..(HEIGHT as i32 - 3)) as f32;
                let tile = self.grid.get(x as i32, y as i32);
                let valid = if kind.aquatic() {
                    tile == Tile::Water
                } else {
                    !matches!(tile, Tile::Void | Tile::Rock | Tile::Water | Tile::Fire)
                };
                if valid {
                    let id = self.next_animal_id;
                    self.next_animal_id += 1;
                    self.animals.push(Animal::new(id, x, y, kind));
                    break;
                }
            }
        }
    }

    fn tick_animals(&mut self) {
        use crate::world::tiles::Biome;

        let org_pos: Vec<(f32, f32)> = self.organisms.iter()
            .filter(|o| o.alive)
            .map(|o| (o.x, o.y))
            .collect();

        for animal in &mut self.animals {
            animal.tick(&self.grid, &org_pos, &mut self.rng);
        }

        // Dog domestication: a fed (energy > 0.7) friendly (low aggression)
        // human within 2 tiles of a hungry (energy < 0.4) wolf has a small
        // chance to convert it into a dog. The dog bonds to that human and
        // stops being a predator.
        let mut tames: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || !matches!(a.kind, AnimalKind::Wolf) { continue; }
            if a.energy >= 0.4 { continue; }
            for (oi, o) in self.organisms.iter().enumerate() {
                if !o.alive || o.energy < 0.7 { continue; }
                if o.traits.aggression > 0.5 { continue; }
                if (o.x - a.x).abs() + (o.y - a.y).abs() > 2.5 { continue; }
                let tame_p = 0.004 + (1.0 - o.traits.aggression) * 0.006;
                if self.rng.gen::<f32>() < tame_p {
                    tames.push((ai, oi));
                    break;
                }
            }
        }
        for (ai, oi) in tames {
            self.animals[ai].kind        = AnimalKind::Dog;
            self.animals[ai].bonded_org  = Some(self.organisms[oi].id.clone());
            self.animals[ai].energy      = (self.animals[ai].energy + 0.30).min(1.0);
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].discoveries.insert("dog".to_string());
            self.organisms[oi].think("befriended a wolf", self.tick_count);
            self.organisms[oi].log_event("tamed a wolf into a dog".to_string());
            push_event(&mut self.events, self.tick_count, "build", &oname,
                "befriended a wolf — it follows them now");
        }

        // Dogs follow their bonded human (one tile per tick toward them when out of range).
        for ai in 0..self.animals.len() {
            if !self.animals[ai].alive { continue; }
            if !matches!(self.animals[ai].kind, AnimalKind::Dog) { continue; }
            let bonded = self.animals[ai].bonded_org.clone();
            if let Some(bid) = bonded {
                if let Some(o) = self.organisms.iter().find(|o| o.alive && o.id == bid) {
                    let (ax, ay) = (self.animals[ai].x, self.animals[ai].y);
                    let dist = (o.x - ax).abs() + (o.y - ay).abs();
                    if dist > 3.0 {
                        let dx = (o.x - ax).signum();
                        let dy = (o.y - ay).signum();
                        let nx = (ax + dx).max(1.0).min(WIDTH as f32 - 2.0);
                        let ny = (ay + dy).max(1.0).min(HEIGHT as f32 - 2.0);
                        let t = self.grid.get(nx as i32, ny as i32);
                        if !matches!(t, Tile::Void | Tile::Rock | Tile::Water | Tile::Fire) {
                            self.animals[ai].x = nx;
                            self.animals[ai].y = ny;
                        }
                    }
                }
            }
        }

        // Wolf attacks: any wolf within 1 tile of a human can bite.
        // Damage scales with the wolf's energy (hungrier wolves hit harder).
        // Each successful bite drains the human's health and energizes
        // the wolf, modelling predation. Pack-hunting humans (>=2 kin
        // adjacent to the wolf) cut the bite chance in half.
        let mut bites: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || !matches!(a.kind, AnimalKind::Wolf) { continue; }
            let (ax, ay) = (a.x, a.y);
            for (oi, o) in self.organisms.iter().enumerate() {
                if !o.alive { continue; }
                let manh = (o.x - ax).abs() + (o.y - ay).abs();
                if manh <= 1.5 {
                    let kin_nearby = self.organisms.iter()
                        .filter(|k| k.alive && k.id != o.id && k.lineage_id == o.lineage_id)
                        .filter(|k| (k.x - ax).abs() + (k.y - ay).abs() <= 3.0)
                        .count();
                    let pack_defence = if kin_nearby >= 2 { 0.5 } else { 1.0 };
                    let weak_bonus = if o.health < 0.5 || o.energy < 0.3 { 0.20 } else { 0.0 };
                    let bite_p = (0.18 + a.energy * 0.10 + weak_bonus) * pack_defence;
                    if self.rng.gen::<f32>() < bite_p {
                        bites.push((ai, oi));
                    }
                }
            }
        }
        for (ai, oi) in bites {
            let dmg = 0.12 + self.rng.gen::<f32>() * 0.08;
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].health = (self.organisms[oi].health - dmg).max(0.0);
            self.organisms[oi].think("a wolf attacks", self.tick_count);
            self.organisms[oi].fear_level = (self.organisms[oi].fear_level + 0.25).min(1.0);
            self.animals[ai].energy = (self.animals[ai].energy + 0.20).min(1.0);
            push_event(&mut self.events, self.tick_count, "danger", &oname,
                "mauled by a wolf");
        }

        // Reproduction shaped by environment, not a hard global floor.
        //
        // Each healthy animal may reproduce at a base rate scaled by:
        //  - Biome suitability (forests favour deer, grass/wetland favours rabbits)
        //  - Local carrying capacity (population density within ~12 tiles drags rate
        //    toward zero so habitats can't be flooded)
        //  - A soft global ceiling (no fixed floor or cap that bypasses ecology)
        //
        // The hard `if alive < 50` global cap is gone - population emerges from
        // birth/death curves, predator (organism) pressure, and biome carrying
        // capacity. A tundra or volcanic landscape now actually starves out
        // populations as it should.
        let candidates: Vec<(usize, f32, f32, AnimalKind)> = self.animals.iter()
            .filter(|a| a.alive && a.energy > 0.70
                     && self.tick_count.saturating_sub(a.last_reproduced) > 800)
            .map(|a| (a.id, a.x, a.y, a.kind))
            .collect();

        for (pid, px, py, kind) in candidates {
            let biome = self.grid.biome_at(px as i32, py as i32);
            let biome_mult: f32 = match (kind, biome) {
                (AnimalKind::Rabbit, Biome::Grassland) => 1.5,
                (AnimalKind::Rabbit, Biome::Wetland)   => 1.3,
                (AnimalKind::Rabbit, Biome::Forest)    => 1.0,
                (AnimalKind::Rabbit, Biome::Desert)    => 0.4,
                (AnimalKind::Rabbit, Biome::Tundra)    => 0.5,
                (AnimalKind::Rabbit, Biome::Volcanic)  => 0.1,
                (AnimalKind::Deer,   Biome::Forest)    => 1.6,
                (AnimalKind::Deer,   Biome::Grassland) => 1.2,
                (AnimalKind::Deer,   Biome::Wetland)   => 1.0,
                (AnimalKind::Deer,   Biome::Tundra)    => 0.6,
                (AnimalKind::Deer,   Biome::Desert)    => 0.3,
                (AnimalKind::Deer,   Biome::Volcanic)  => 0.1,
                (AnimalKind::Boar,   Biome::Forest)    => 1.4,
                (AnimalKind::Boar,   Biome::Wetland)   => 1.2,
                (AnimalKind::Boar,   Biome::Grassland) => 0.8,
                (AnimalKind::Boar,   _)                => 0.2,
                (AnimalKind::Bird,   Biome::Forest)    => 1.4,
                (AnimalKind::Bird,   Biome::Wetland)   => 1.3,
                (AnimalKind::Bird,   Biome::Grassland) => 1.1,
                (AnimalKind::Bird,   Biome::Tundra)    => 0.7,
                (AnimalKind::Bird,   Biome::Desert)    => 0.4,
                (AnimalKind::Bird,   Biome::Volcanic)  => 0.1,
                (AnimalKind::Fish,   Biome::Wetland)   => 0.7,
                (AnimalKind::Fish,   _)                => 0.5,
                (AnimalKind::Wolf,   Biome::Forest)    => 0.8,
                (AnimalKind::Wolf,   Biome::Tundra)    => 1.0,
                (AnimalKind::Wolf,   Biome::Grassland) => 0.5,
                (AnimalKind::Wolf,   _)                => 0.2,
                (AnimalKind::Dog,    _)                => 0.0,
            };

            let local_density = self.animals.iter()
                .filter(|a| a.alive && (a.x - px).abs() + (a.y - py).abs() <= 14.0)
                .count() as f32;
            let density_factor = (1.0 - (local_density / 3.0).min(1.0)).max(0.0);

            // Global soft cap: birth rate halves once total alive animals
            // crosses 600, drops to ~0 around 1000. Keeps the world from
            // being smothered by a runaway prey explosion.
            let total_alive = self.animals.iter().filter(|a| a.alive).count() as f32;
            let global_factor = (1.0 - (total_alive - 600.0).max(0.0) / 400.0).max(0.0);

            let p = 0.0005 * biome_mult * density_factor * global_factor;
            if p > 0.0 && self.rng.gen::<f32>() < p {
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

        self.animals.retain(|a| a.alive);
    }

    fn check_animal_catches(&mut self) {
        // Collect (org_idx, animal_idx) where they're adjacent
        let mut to_catch: Vec<(usize, usize)> = Vec::new();
        let organism_spatial = SpatialIndex::build(&self.organisms, 10);
        for (oi, org) in self.organisms.iter().enumerate() {
            if !org.alive { continue; }
            let (ox, oy) = (org.x as i32, org.y as i32);
            for (ai, animal) in self.animals.iter().enumerate() {
                if !animal.alive { continue; }
                let (ax, ay) = (animal.x as i32, animal.y as i32);
                let manh = (ox - ax).abs() + (oy - ay).abs();
                if manh <= 2 {
                    if matches!(animal.kind, AnimalKind::Dog) { continue; }
                    let base_p = match animal.kind {
                        AnimalKind::Rabbit => 0.32,
                        AnimalKind::Deer   => 0.18,
                        AnimalKind::Boar   => 0.14,
                        AnimalKind::Bird   => 0.16,
                        AnimalKind::Fish   => 0.26,
                        AnimalKind::Wolf   => 0.10,
                        _                  => 0.0,
                    };
                    let weapon_bonus = if org.discoveries.contains("spear") { 0.22 }
                                       else if org.discoveries.contains("stone_tools") { 0.12 }
                                       else if org.discoveries.contains("hunt") { 0.06 }
                                       else { 0.0 };
                    let dist_penalty = if manh == 2 { 0.6 } else { 1.0 };
                    let p = (base_p + org.traits.aggression * 0.18 + weapon_bonus) * dist_penalty;
                    if self.rng.gen::<f32>() < p {
                        to_catch.push((oi, ai));
                    }
                }
            }
        }

        // Apply catches - each animal caught once (first hunter wins)
        let mut caught: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for (oi, ai) in to_catch {
            if caught.contains(&ai) { continue; }
            caught.insert(ai);
            let (kind, boost) = match self.animals[ai].kind {
                AnimalKind::Rabbit => ("rabbit", 0.30),
                AnimalKind::Deer   => ("deer",   0.55),
                AnimalKind::Boar   => ("boar",   0.65),
                AnimalKind::Bird   => ("bird",   0.18),
                AnimalKind::Fish   => ("fish",   0.32),
                AnimalKind::Wolf   => ("wolf",   0.45),
                AnimalKind::Dog    => ("dog",    0.0),
            };
            let (ax, ay) = (self.animals[ai].x as i32, self.animals[ai].y as i32);
            self.animals[ai].alive = false;
            let ms = self.organisms[oi].traits.memory_strength;
            let has_tools = self.organisms[oi].discoveries.contains("stone_tools")
                || self.organisms[oi].discoveries.contains("spear");
            let tool_bonus = if has_tools { 0.10 } else { 0.0 };
            // Pack hunting: 3+ kin within 5 tiles = coordinated group hunt
            let hunter_lid = self.organisms[oi].lineage_id.clone();
            let hunter_x = self.organisms[oi].x;
            let hunter_y = self.organisms[oi].y;
            let pack_kin = organism_spatial.query(hunter_x as i32, hunter_y as i32, 5)
                .into_iter()
                .filter(|&i| i != oi)
                .filter(|&i| {
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == hunter_lid
                        && (o.x - hunter_x).abs() + (o.y - hunter_y).abs() <= 5.0
                })
                .count();
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
            Organism::remember(&mut self.organisms[oi].food_memory, ax, ay, 0.65, ms);

            // Share the kill with the pack. Pack hunting is the canonical
            // human cooperative behaviour - the carcass feeds everyone who
            // helped bring it down, not just the org that landed the
            // killing blow. Each pack member within 5 tiles gets a share
            // proportional to how much remains after the hunter's portion.
            if pack_kin >= 1 {
                let share = if pack_kin >= 3 { 0.12 } else { 0.08 };
                let helpers: Vec<usize> = organism_spatial.query(hunter_x as i32, hunter_y as i32, 5)
                    .into_iter()
                    .filter(|&i| i != oi)
                    .filter(|&i| {
                        let o = &self.organisms[i];
                        o.alive && o.lineage_id == hunter_lid
                            && (o.x - hunter_x).abs() + (o.y - hunter_y).abs() <= 5.0
                    })
                    .collect();
                for hi in helpers {
                    self.organisms[hi].energy = (self.organisms[hi].energy + share).min(1.0);
                    self.organisms[hi].think("shared in the hunt", self.tick_count);
                }
            }
        }

        self.animals.retain(|a| a.alive);
    }

    fn apply_water_fatigue(&mut self, idx: usize, x: i32, y: i32) {
        if self.grid.get(x, y) != Tile::Water {
            self.organisms[idx].water_ticks = 0;
            return;
        }

        let depth = self.grid.depth_at(x, y);
        let ticks = self.organisms[idx].water_ticks.saturating_add(1);
        self.organisms[idx].water_ticks = ticks;

        let fatigue = (ticks.saturating_sub(4) as f32 * 0.00045)
            + 0.0015
            + depth * 0.004;
        self.organisms[idx].energy = (self.organisms[idx].energy - fatigue).max(0.0);

        if ticks > 12 || depth > 0.45 {
            let panic = (ticks.saturating_sub(12) as f32 * 0.0007) + depth * 0.0025;
            self.organisms[idx].health = (self.organisms[idx].health - panic).max(0.0);
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.025 + depth * 0.04).min(1.0);
            self.organisms[idx].think("struggling in water", self.tick_count);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, x, y, 0.85, ms);
        }

        if ticks > 6 {
            if let Some(land) = self.nearest_land_from(x, y, 18) {
                self.organisms[idx].wander_target = Some(land);
            }
        }
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────

    fn broadcast_discovery(&mut self, actor_idx: usize, x: i32, y: i32,
                           rtype: &str, radius: i32) {
        let (ax, ay) = (self.organisms[actor_idx].x, self.organisms[actor_idx].y);
        for i in self.current_nearby_organisms(ax as i32, ay as i32, radius) {
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

    fn current_nearby_organisms(&self, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let spatial = SpatialIndex::build(&self.organisms, 10);
        spatial.query(x, y, radius)
            .into_iter()
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive
                    && ((o.x as i32 - x).abs() + (o.y as i32 - y).abs()) <= radius
            })
            .collect()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Regional oral history: scan a handful of random alive orgs and
    /// check whether any is standing near an OLD centroid of their own
    /// lineage (10+ sim-days back). If so, fire a "this was our
    /// grandparents' land" thought. Cheap by design - we cap the scan
    /// to a few orgs and a few historical samples per call.
    fn tick_ancestral_recognition(&mut self) {
        // Look back at samples this many sim-days old or older. Less than
        // this and the org's just standing in their tribe's current
        // village - not interesting. More than this and the centroid is
        // genuinely ancestral.
        const ANCIENT_AFTER_DAYS: u64 = 10;
        const RECOG_RADIUS: f32 = 5.0;
        const ORGS_TO_CHECK: usize = 6;
        const COOLDOWN_TICKS: u64 = 1800;

        let now = self.tick_count;
        let ancient_cutoff = now as i32 - (ANCIENT_AFTER_DAYS * DAY_LENGTH) as i32;

        let alive_indices: Vec<usize> = self.organisms.iter().enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, _)| i)
            .collect();
        if alive_indices.is_empty() { return; }

        for _ in 0..ORGS_TO_CHECK {
            let idx = alive_indices[self.rng.gen_range(0..alive_indices.len())];
            // Cooldown so an org doesn't spam ancestral thoughts every
            // 60 ticks while standing in the same spot.
            if now.saturating_sub(self.organisms[idx].last_ancestral_thought) < COOLDOWN_TICKS {
                continue;
            }
            let org_lid = self.organisms[idx].lineage_id.clone();
            let ox = self.organisms[idx].x;
            let oy = self.organisms[idx].y;
            let Some(samples) = self.lineage_centroid_history.get(&org_lid) else { continue };
            // Walk only the ancient half of the history - oldest samples
            // are at the front of the VecDeque.
            let mut matched: Option<i32> = None;
            for s in samples.iter() {
                if s[0] >= ancient_cutoff { break; }
                let dx = ox - s[1] as f32;
                let dy = oy - s[2] as f32;
                if dx * dx + dy * dy <= RECOG_RADIUS * RECOG_RADIUS {
                    matched = Some(s[0]);
                    break;
                }
            }
            if let Some(sample_tick) = matched {
                let age_days = (now as i32 - sample_tick) / DAY_LENGTH as i32;
                let thought = if age_days >= 30 {
                    "ancestors walked here"
                } else if age_days >= 20 {
                    "our grandparents' land"
                } else {
                    "the elders mentioned this place"
                };
                self.organisms[idx].thought = thought.to_string();
                self.organisms[idx].last_ancestral_thought = now;
            }
        }
    }

    /// Sample each living lineage's centroid (mean x, mean y) and append
    /// it to that lineage's history. Called once per sim-day from `tick`.
    /// Dead lineages get aged out: after 30 days with no living members we
    /// drop their history so the map doesn't accumulate ancestor trails
    /// from extinct tribes indefinitely.
    fn sample_lineage_centroids(&mut self) {
        let mut sums: HashMap<&str, (f32, f32, u32)> = HashMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let e = sums.entry(o.lineage_id.as_str()).or_insert((0.0, 0.0, 0));
            e.0 += o.x; e.1 += o.y; e.2 += 1;
        }
        let tick = self.tick_count as i32;
        let alive_lineages: HashSet<String> = sums.keys().map(|s| s.to_string()).collect();
        for (lid_str, (sx, sy, n)) in sums {
            if n == 0 { continue; }
            let entry = self.lineage_centroid_history
                .entry(lid_str.to_string())
                .or_default();
            entry.push_back([tick, (sx / n as f32) as i32, (sy / n as f32) as i32]);
            // Keep ~60 samples (~60 sim-days) per lineage; trail still
            // reads as a continuous drift but bounded memory.
            if entry.len() > 60 { entry.pop_front(); }
        }
        // Age out lineages that have been extinct for > 30 sample-gaps
        // (30 sim-days). Last sample tick + 30*DAY_LENGTH < now means
        // we haven't seen this lineage alive in two months.
        let cutoff = tick - 30 * DAY_LENGTH as i32;
        self.lineage_centroid_history.retain(|lid, samples| {
            if alive_lineages.contains(lid) { return true; }
            samples.back().map(|s| s[0] >= cutoff).unwrap_or(false)
        });
    }

    /// Detect emergent settlements: clusters of built structure attributed
    /// to the nearest lineage. As a tribe accumulates shelters its
    /// settlement climbs tiers - camp, hamlet, village, town, city - and
    /// each promotion is logged as a watchable milestone.
    fn tick_settlements(&mut self) {
        const TIER_NAMES: [&str; 6] =
            ["wilderness", "camp", "hamlet", "village", "town", "city"];
        // (tier index, structure-tile count needed)
        const THRESHOLDS: [usize; 6] = [0, 4, 10, 22, 40, 70];

        // Collect qualifying built tiles.
        let mut built: Vec<(i32, i32)> = self.active_structure_tiles.iter()
            .filter(|&&(x, y)| {
                self.grid.structure_at(x, y) >= 0.35
                    || matches!(self.grid.get(x, y), Tile::Hut | Tile::Campfire)
            })
            .copied()
            .collect();
        // Cap work - settlements are big but we don't need every tile.
        if built.len() > 4000 { built.truncate(4000); }

        // Attribute each built tile to the nearest living organism's lineage.
        let mut counts: HashMap<String, usize> = HashMap::new();
        for (bx, by) in built {
            let mut best: Option<(f32, &str)> = None;
            for o in self.organisms.iter().filter(|o| o.alive) {
                let d = (o.x - bx as f32).abs() + (o.y - by as f32).abs();
                if d <= 16.0 && best.map(|(bd, _)| d < bd).unwrap_or(true) {
                    best = Some((d, o.lineage_id.as_str()));
                }
            }
            if let Some((_, lid)) = best {
                *counts.entry(lid.to_string()).or_insert(0) += 1;
            }
        }

        for (lid, count) in counts {
            let mut tier = 0u8;
            for (t, &need) in THRESHOLDS.iter().enumerate() {
                if count >= need { tier = t as u8; }
            }
            let prev = *self.settlement_tiers.get(&lid).unwrap_or(&0);
            if tier > prev {
                self.settlement_tiers.insert(lid.clone(), tier);
                let tribe = self.lineage_names.get(&lid)
                    .cloned()
                    .unwrap_or_else(|| "a tribe".to_string());
                let msg = format!(
                    "{}'s settlement grew into a {}",
                    tribe, TIER_NAMES[tier as usize]
                );
                push_event(&mut self.events, self.tick_count, "build", &tribe, &msg);
            } else if tier < prev {
                // Settlement decayed (abandoned / structures lost).
                self.settlement_tiers.insert(lid.clone(), tier);
            }
        }
    }

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


}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scarcity_migration_uses_configured_season_names() {
        assert!(scarcity_driven_migration_season("scarcity"));
        assert!(scarcity_driven_migration_season("decline"));
        assert!(!scarcity_driven_migration_season("winter"));
        assert!(!scarcity_driven_migration_season("dry"));
    }

    #[test]
    fn save_result_writes_schema_version_and_cleans_temp_file() {
        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-save-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let tmp_s = format!("{}.tmp", path_s);
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(&tmp_s);

        let sim = Simulation::new(11);
        sim.save_result(&path_s).unwrap();

        let saved = std::fs::read_to_string(&path_s).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&saved).unwrap();
        assert_eq!(parsed["version"], SAVE_SCHEMA_VERSION);
        assert!(!std::path::Path::new(&tmp_s).exists());

        let _ = std::fs::remove_file(&path_s);
    }

    #[test]
    fn save_load_preserves_social_continuity_and_rng_stream() {
        use rand::Rng;

        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-continuity-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let tmp_s = format!("{}.tmp", path_s);
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(&tmp_s);

        let mut sim = Simulation::new(17);
        sim.tick_count = 12_345;
        sim.lineage_strategies.insert("lineage-a".to_string(), ("settle".to_string(), 13_000));
        sim.lineage_last_council.insert("lineage-a".to_string(), 12_000);
        sim.lineage_elders.insert("lineage-a".to_string(), "elder-a".to_string());
        sim.lineage_negotiations.insert(("lineage-a".to_string(), "lineage-b".to_string()), 11_500);
        sim.pending_thinks.push(ThinkTrigger {
            org_id: "org-a".to_string(),
            org_name: "Org A".to_string(),
            lineage_id: "lineage-a".to_string(),
            scenario: "migration".to_string(),
            context: "food scarce".to_string(),
            ..Default::default()
        });

        let mut expected_rng = sim.rng.clone();
        let expected_next: u64 = expected_rng.gen();

        sim.save_result(&path_s).unwrap();
        let mut loaded = Simulation::load_or_new(999, &path_s);

        assert_eq!(
            loaded.lineage_strategies.get("lineage-a"),
            Some(&("settle".to_string(), 13_000))
        );
        assert_eq!(loaded.lineage_last_council.get("lineage-a"), Some(&12_000));
        assert_eq!(loaded.lineage_elders.get("lineage-a"), Some(&"elder-a".to_string()));
        assert_eq!(
            loaded.lineage_negotiations.get(&("lineage-a".to_string(), "lineage-b".to_string())),
            Some(&11_500)
        );
        assert_eq!(loaded.pending_thinks.len(), 1);
        assert_eq!(loaded.pending_thinks[0].scenario, "migration");
        assert_eq!(loaded.rng.gen::<u64>(), expected_next);

        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(&tmp_s);
    }

    #[test]
    fn save_load_preserves_organism_cooldowns_for_deterministic_replay() {
        // Modern saves must round-trip last_think_tick / last_invention_tick exactly,
        // otherwise post-load behaviour diverges from a continuous run and replay
        // becomes useless for debugging or viability gates.

        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-cooldown-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));

        let mut sim = Simulation::new(42);
        sim.tick_count = 50_000;
        // Pick an organism whose cooldowns are far enough in the past that the legacy
        // jitter logic WOULD trigger if it ran. We must verify it doesn't.
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].last_think_tick = 1_000;       // 49,000 ticks ago, well past 4000
        sim.organisms[idx].last_invention_tick = 2_000;   // 48,000 ticks ago, well past 5000
        let org_id = sim.organisms[idx].id.clone();

        sim.save_result(&path_s).unwrap();
        let loaded = Simulation::load_or_new(999, &path_s);

        let loaded_org = loaded.organisms.iter().find(|o| o.id == org_id).unwrap();
        assert_eq!(loaded_org.last_think_tick,     1_000, "cooldown was jittered on load - breaks determinism");
        assert_eq!(loaded_org.last_invention_tick, 2_000, "cooldown was jittered on load - breaks determinism");

        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));
    }

    #[test]
    fn save_load_preserves_in_progress_flood_tiles() {
        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-flood-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));

        let mut sim = Simulation::new(7);
        sim.tick_count = 100;
        sim.flood_tiles = vec![(10, 20, 200), (30, 40, 250)];

        sim.save_result(&path_s).unwrap();
        let loaded = Simulation::load_or_new(999, &path_s);

        assert_eq!(loaded.flood_tiles, vec![(10, 20, 200), (30, 40, 250)]);

        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));
    }

    #[test]
    fn queued_think_triggers_copy_live_organism_traits() {
        let mut sim = Simulation::new(13);
        let org_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[org_idx].traits.aggression = 0.91;
        sim.organisms[org_idx].traits.fear = 0.12;
        sim.organisms[org_idx].traits.social_tendency = 0.34;
        sim.organisms[org_idx].traits.curiosity = 0.56;
        sim.organisms[org_idx].traits.resilience = 0.78;

        sim.push_think_for(org_idx, ThinkTrigger {
            org_id: sim.organisms[org_idx].id.clone(),
            scenario: "first_contact".to_string(),
            ..Default::default()
        });

        let trigger = sim.pending_thinks.last().unwrap();
        assert_eq!(trigger.aggression, 0.91);
        assert_eq!(trigger.fear, 0.12);
        assert_eq!(trigger.social_tendency, 0.34);
        assert_eq!(trigger.curiosity, 0.56);
        assert_eq!(trigger.resilience, 0.78);
    }

    #[test]
    fn viewport_state_excludes_far_organisms_on_incremental_ticks() {
        let mut sim = Simulation::new(19);
        sim.tick_count = 2;
        let near_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[near_idx].x = 10.0;
        sim.organisms[near_idx].y = 10.0;
        let near_id = sim.organisms[near_idx].id.clone();

        let far_idx = sim.organisms.iter().enumerate()
            .find(|(i, o)| *i != near_idx && o.alive)
            .map(|(i, _)| i)
            .unwrap();
        sim.organisms[far_idx].x = (WIDTH - 10) as f32;
        sim.organisms[far_idx].y = (HEIGHT - 10) as f32;
        let far_id = sim.organisms[far_idx].id.clone();

        let state = sim.state_json_at(10, 10);
        // Deltas use structure-of-arrays packing under `organisms_hot`.
        // Full snapshots would use the AoS `organisms` array instead.
        let ids: Vec<String> = state["organisms_hot"]["ids"].as_array().unwrap()
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        assert!(ids.contains(&near_id));
        assert!(!ids.contains(&far_id));
        assert_eq!(state["organisms_complete"], false);
        assert!(state.get("organisms").is_none(),
            "deltas should not carry the AoS organisms array");
    }

    #[test]
    fn incremental_state_omits_cold_world_metadata() {
        let mut sim = Simulation::new(29);
        sim.tick_count = 2;

        let state = sim.state_json_at(10, 10);
        let obj = state.as_object().unwrap();

        for key in [
            "events",
            "history",
            "story_history",
            "pop_history",
            "tribal_relations",
            "lineage_sizes",
            "lineage_names",
            "current_era",
            "sex_words",
        ] {
            assert!(
                !obj.contains_key(key),
                "incremental frame unexpectedly included cold key {key}",
            );
        }
    }

    #[test]
    fn full_state_keeps_cold_world_metadata() {
        let mut sim = Simulation::new(31);
        sim.tick_count = 2;

        let state = sim.state_json();
        let obj = state.as_object().unwrap();

        for key in [
            "events",
            "history",
            "story_history",
            "pop_history",
            "tribal_relations",
            "lineage_sizes",
            "lineage_names",
            "current_era",
            "sex_words",
        ] {
            assert!(obj.contains_key(key), "full frame omitted cold key {key}");
        }
    }

    #[test]
    fn current_position_spatial_query_excludes_far_organisms() {
        let mut sim = Simulation::new(23);
        let center_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[center_idx].x = 20.0;
        sim.organisms[center_idx].y = 20.0;

        let near_idx = sim.organisms.iter().enumerate()
            .find(|(i, o)| *i != center_idx && o.alive)
            .map(|(i, _)| i)
            .unwrap();
        sim.organisms[near_idx].x = 24.0;
        sim.organisms[near_idx].y = 20.0;

        let far_idx = sim.organisms.iter().enumerate()
            .find(|(i, o)| *i != center_idx && *i != near_idx && o.alive)
            .map(|(i, _)| i)
            .unwrap();
        sim.organisms[far_idx].x = 80.0;
        sim.organisms[far_idx].y = 80.0;

        let nearby = sim.current_nearby_organisms(20, 20, 6);
        assert!(nearby.contains(&center_idx));
        assert!(nearby.contains(&near_idx));
        assert!(!nearby.contains(&far_idx));
    }

    #[test]
    fn animal_population_does_not_respawn_without_living_adults() {
        let mut sim = Simulation::new(29);
        sim.animals.clear();

        sim.tick_animals();

        assert_eq!(sim.animals.iter().filter(|a| a.alive).count(), 0);
    }

    #[test]
    fn deep_water_fatigue_causes_panic_and_marks_danger() {
        let mut sim = Simulation::new(33);
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].x = 50.0;
        sim.organisms[idx].y = 50.0;
        sim.organisms[idx].energy = 0.9;
        sim.organisms[idx].health = 0.9;
        sim.organisms[idx].fear_level = 0.1;
        sim.organisms[idx].water_ticks = 13;
        sim.grid.set(50, 50, Tile::Water);
        sim.grid.depth[WorldGrid::idx(50, 50)] = 0.8;
        sim.grid.set(51, 50, Tile::Grass);

        sim.apply_water_fatigue(idx, 50, 50);

        assert!(sim.organisms[idx].energy < 0.9);
        assert!(sim.organisms[idx].health < 0.9);
        assert!(sim.organisms[idx].fear_level > 0.1);
        let escape = sim.organisms[idx].wander_target.expect("swimmer should pick nearby land");
        assert_ne!(sim.grid.get(escape.0, escape.1), Tile::Water);
        assert!(sim.organisms[idx].danger_memory.contains_key(&(50, 50)));
    }

    #[test]
    fn curious_adults_choose_distant_land_expeditions() {
        let mut sim = Simulation::new(35);
        for x in 0..WIDTH as i32 {
            for y in 0..HEIGHT as i32 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].id = "curious-adult".to_string();
        sim.organisms[idx].x = (WIDTH / 2) as f32;
        sim.organisms[idx].y = (HEIGHT / 2) as f32;
        sim.organisms[idx].age = 2_000;
        sim.organisms[idx].energy = 0.95;
        sim.organisms[idx].hydration = 0.95;
        sim.organisms[idx].fear_level = 0.0;
        sim.organisms[idx].traits.curiosity = 0.9;
        let curiosity = sim.organisms[idx].traits.curiosity;
        let hash = sim.organisms[idx].id.bytes()
            .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        // Mirrors the period formula in validate_or_assign_wander_target.
        let period = (450u64).saturating_sub((curiosity * 200.0) as u64).max(140);
        sim.tick_count = hash % period;

        sim.validate_or_assign_wander_target(idx);

        let target = sim.organisms[idx].wander_target.expect("curious adult should choose a land expedition");
        let dist = (target.0 - sim.organisms[idx].x as i32).abs()
            + (target.1 - sim.organisms[idx].y as i32).abs();
        let expected_min = 60 + (curiosity * 90.0) as i32;
        assert!(dist >= expected_min,
            "dist={} curiosity={} period={} tick_count={} expected>={}",
            dist, curiosity, period, sim.tick_count, expected_min);
        assert_eq!(sim.grid.get(target.0, target.1), Tile::Grass);
    }

    #[test]
    fn founders_spread_across_world_sectors() {
        // The user reported tribes clumping in one corner of the map. With
        // a 4x3 sector partition and the random scatter fallback, spawn
        // positions should cover at least half the sectors and reach into
        // both halves of the world along each axis. Run several seeds so
        // a single unlucky one doesn't mask a regression.
        for seed in [1u64, 7, 42, 99, 137] {
            let sim = Simulation::new(seed);
            let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
            assert!(alive.len() >= 100, "seed {seed} fewer founders than expected: {}", alive.len());

            let xs: Vec<f32> = alive.iter().map(|o| o.x).collect();
            let ys: Vec<f32> = alive.iter().map(|o| o.y).collect();
            let xmin = xs.iter().cloned().fold(f32::INFINITY, f32::min);
            let xmax = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let ymin = ys.iter().cloned().fold(f32::INFINITY, f32::min);
            let ymax = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let span_x = xmax - xmin;
            let span_y = ymax - ymin;

            // Tribes must span at least 40% of the world's width and 30%
            // of its height. If they all cluster in one sector both spans
            // collapse to a few dozen tiles and the test fires.
            assert!(span_x >= WIDTH as f32 * 0.40,
                "seed {seed} founders span only {} of {} tiles wide", span_x, WIDTH);
            assert!(span_y >= HEIGHT as f32 * 0.30,
                "seed {seed} founders span only {} of {} tiles tall", span_y, HEIGHT);

            // Per-lineage centroids: at least 6 distinct lineages should
            // exist, and their centroids should cover at least 30% of
            // each axis (otherwise tribes are bunched even if individuals
            // wander a bit).
            use std::collections::HashMap;
            let mut by_lid: HashMap<String, Vec<(f32, f32)>> = HashMap::new();
            for o in &alive {
                by_lid.entry(o.lineage_id.clone()).or_default().push((o.x, o.y));
            }
            let centroids: Vec<(f32, f32)> = by_lid.values()
                .map(|pts| {
                    let n = pts.len() as f32;
                    let cx = pts.iter().map(|p| p.0).sum::<f32>() / n;
                    let cy = pts.iter().map(|p| p.1).sum::<f32>() / n;
                    (cx, cy)
                })
                .collect();
            assert!(centroids.len() >= 6,
                "seed {seed} only produced {} lineages", centroids.len());
            let cxmin = centroids.iter().map(|c| c.0).fold(f32::INFINITY, f32::min);
            let cxmax = centroids.iter().map(|c| c.0).fold(f32::NEG_INFINITY, f32::max);
            let cymin = centroids.iter().map(|c| c.1).fold(f32::INFINITY, f32::min);
            let cymax = centroids.iter().map(|c| c.1).fold(f32::NEG_INFINITY, f32::max);
            assert!(cxmax - cxmin >= WIDTH as f32 * 0.30,
                "seed {seed} lineage centroids only {} wide", cxmax - cxmin);
            assert!(cymax - cymin >= HEIGHT as f32 * 0.20,
                "seed {seed} lineage centroids only {} tall", cymax - cymin);
        }
    }

    #[test]
    fn population_stays_dispersed_after_many_days() {
        // Spawn placement spreads tribes across a 4x3 sector grid, but if home
        // pull or kin convergence is too strong they collapse back together
        // within a sim-day or two. Run ~1.5 sim-days (9k ticks) and require
        // the live population's std-dev to remain a meaningful fraction of
        // the world. Guards against regressions where a tweak to home pull,
        // shelter drift, or kin convergence quietly re-clusters everyone.
        for seed in [42u64, 99] {
            let mut sim = Simulation::new(seed);
            for _ in 0..9_000 {
                sim.tick();
            }
            let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
            assert!(alive.len() >= 80,
                "seed {seed} population collapsed to {} after 3 days", alive.len());

            let n = alive.len() as f32;
            let mx = alive.iter().map(|o| o.x).sum::<f32>() / n;
            let my = alive.iter().map(|o| o.y).sum::<f32>() / n;
            let varx = alive.iter().map(|o| (o.x - mx).powi(2)).sum::<f32>() / n;
            let vary = alive.iter().map(|o| (o.y - my).powi(2)).sum::<f32>() / n;
            let stdx = varx.sqrt();
            let stdy = vary.sqrt();

            assert!(stdx >= WIDTH as f32 * 0.18,
                "seed {seed} stdx {stdx} too small (clustered) - WIDTH={WIDTH}");
            assert!(stdy >= HEIGHT as f32 * 0.10,
                "seed {seed} stdy {stdy} too small (clustered) - HEIGHT={HEIGHT}");
        }
    }

    #[test]
    fn dense_animal_clusters_stop_reproducing() {
        // Carrying capacity check: drop 20 healthy rabbits in a tight cluster
        // and run many ticks. Density factor should suppress reproduction so the
        // count stays bounded - no runaway growth, no need for a hard global cap.
        let mut sim = Simulation::new(31);
        sim.animals.clear();
        for i in 0..20 {
            let mut a = Animal::new(i, 50.0, 50.0, AnimalKind::Rabbit);
            a.energy = 0.95;
            // Set last_reproduced way in the past so all animals are eligible
            a.last_reproduced = 0;
            sim.animals.push(a);
        }
        sim.next_animal_id = 100;
        sim.tick_count = 5_000;

        for _ in 0..2_000 { sim.tick_animals(); }

        let alive = sim.animals.iter().filter(|a| a.alive).count();
        assert!(alive <= 35,
            "dense cluster ran away to {alive} animals - carrying-capacity factor isn't working");
    }
}
