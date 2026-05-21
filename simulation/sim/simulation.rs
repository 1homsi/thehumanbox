use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Serialize, Deserialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io;
use crate::organism::organism::{Organism, DIRECTIONS, generate_tribe_name};
use crate::organism::attributes::check_earned_attributes;
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::{grid::{WorldGrid, TrailKind, WIDTH, HEIGHT}, tiles::Tile};
use crate::physics::engine::PhysicsEngine;
use super::config::{DAY_LENGTH, SEASON_LENGTH, SEASONS, season_growth};
use super::world_events::{DroughtState, WeatherState, tick_drought, tick_outbreak, tick_weather, tick_world_evolution, push_event};
use super::{social, growth, courtship};

fn derive_mood(o: &Organism) -> String {
    if o.infection > 0.20 { "sick" }
    else if o.energy   < 0.30 { "hungry" }
    else if o.hydration< 0.30 { "thirsty" }
    else if o.fear_level > 0.40 { "afraid" }
    else if o.grief_ticks > 0 { "mourning" }
    else if o.loneliness > 0.60 { "lonely" }
    else if o.is_elder { "weary" }
    else { "content" }.to_string()
}
use super::spatial::SpatialIndex;

pub const SAVE_SCHEMA_VERSION: u32 = 3;

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
    pub aggression:        f32,
    pub fear:              f32,
    pub social_tendency:   f32,
    pub curiosity:         f32,
    pub resilience:        f32,
    pub world_era:         String,
    pub season:            String,
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
            aggression: 0.5, fear: 0.5, social_tendency: 0.5,
            curiosity: 0.5, resilience: 0.5,
            world_era: String::new(), season: String::new(),
        }
    }
}

impl ThinkTrigger {
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
    pub pending_convos:        Vec<crate::sim::convo_req::ConversationReq>,
    pub lineage_names:         HashMap<String, String>,
    pub lineage_strategies:    HashMap<String, (String, u64)>,
    pub(crate) lineage_last_council: HashMap<String, u64>,
    pub(crate) lineage_elders:       HashMap<String, String>,
    pub(crate) lineage_negotiations: HashMap<(String,String), u64>,
    pub pop_history:           VecDeque<[u64; 2]>,
    pub lineage_centroid_history: HashMap<String, VecDeque<[i32; 3]>>,
    /// Ancestral home per lineage - stamped the first time the
    /// lineage shows up in tick_lineage_centroids and never overwritten.
    /// Lets the client render an "where this lineage came from"
    /// overlay even after living members have wandered far away.
    /// Format: [home_x, home_y, radius_tiles]. Radius is fixed at 30
    /// tiles today; future work can derive it from the historical
    /// spread of centroids.
    pub lineage_homes: HashMap<String, [i32; 3]>,
    pub current_era:           String,
    pub sex_words:             [String; 2],
    pub world_seed:            u64,
    pub(crate) next_animal_id: usize,
    pub(crate) rng:            ChaCha8Rng,
    pub last_immigration_tick: u64,
    pub(crate) cached_tribal_relations: serde_json::Value,
    pub(crate) cached_lineage_sizes:    serde_json::Value,
    pub(crate) slow_compute_tick:       u64,
    pub(crate) active_structure_tiles: HashSet<(i32, i32)>,
    pub(crate) settlement_tiers: HashMap<String, u8>,
    // lineage_id → set of claimed tiles. Kept for serialisation, draw
    // overlays, and territory-size eviction logic.
    pub territory: HashMap<String, HashSet<(i32, i32)>>,
    // Inverse of `territory`: tile → most-recent-claimer lineage_id.
    // Avoids the O(L × T) scan of the forward map for per-org rival
    // lookups every tick. "Most recent wins" is fine for our attitude-
    // decay use - we just need *a* rival, not the full conflict set.
    pub(crate) tile_owner: HashMap<(i32, i32), String>,
    pub(crate) cached_territory: serde_json::Value,
}

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
            pending_convos: Vec::new(),
            lineage_names:        HashMap::new(),
            lineage_strategies:   HashMap::new(),
            lineage_last_council: HashMap::new(),
            lineage_elders:       HashMap::new(),
            lineage_negotiations: HashMap::new(),
            pop_history: VecDeque::new(),
            lineage_centroid_history: HashMap::new(),
            lineage_homes:           HashMap::new(),
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
            territory:               HashMap::new(),
            tile_owner:              HashMap::new(),
            cached_territory:        serde_json::Value::Null,
        };
        sim.spawn_founders();
        sim.spawn_animals(14);
        sim
    }

    fn push_think_for(&mut self, org_idx: usize, mut trigger: ThinkTrigger) {
        trigger = trigger.with_traits(&self.organisms[org_idx]);
        // Inject world context so the LLM knows what era / season the
        // org lives in. Otherwise eras only show up as world events,
        // never in organism cognition.
        if trigger.world_era.is_empty() { trigger.world_era = self.current_era.clone(); }
        if trigger.season.is_empty()    { trigger.season    = self.season().to_string(); }
        self.pending_thinks.push(trigger);
    }

    pub fn apply_memory_pressure(&mut self, pressure: super::memory_pressure::MemoryPressure) {
        use super::memory_pressure::MemoryPressure;
        match pressure {
            MemoryPressure::Normal => return,
            MemoryPressure::Elevated => {
                self.organisms.retain(|o| {
                    o.alive || self.tick_count.saturating_sub(o.last_story_tick) < 30_000
                });
                let mut dead_kept = 0usize;
                self.organisms.retain(|o| {
                    if o.alive { return true; }
                    dead_kept += 1;
                    dead_kept <= 400
                });
                for o in self.organisms.iter_mut().filter(|o| o.alive) {
                    o.trim_social_maps();
                }
            }
            MemoryPressure::Critical => {
                self.organisms.retain(|o| o.alive);
                for o in self.organisms.iter_mut() {
                    o.trim_social_maps();
                    while o.life_log.len() > 24 { o.life_log.pop_front(); }
                    while o.thought_history.len() > 16 { o.thought_history.pop_front(); }
                    while o.conversations.len() > 12 { o.conversations.pop_front(); }
                    o.food_memory.retain(|_, v| *v > 0.20);
                    o.water_memory.retain(|_, v| *v > 0.20);
                    o.danger_memory.retain(|_, v| *v > 0.20);
                }
                while self.events.len() > 80 { self.events.pop_front(); }
                while self.story_history.len() > 80 { self.story_history.pop_front(); }
                while self.pop_history.len() > 300 { self.pop_history.pop_front(); }
                while self.history.era_history.len() > 24 { self.history.era_history.pop_front(); }
                let alive_lineages: std::collections::HashSet<String> = self.organisms.iter()
                    .filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect();
                self.lineage_names.retain(|k, _| alive_lineages.contains(k));
                self.lineage_strategies.retain(|k, _| alive_lineages.contains(k));
                self.lineage_centroid_history.retain(|k, _| alive_lineages.contains(k));
                self.lineage_last_council.retain(|k, _| alive_lineages.contains(k));
                self.lineage_elders.retain(|k, _| alive_lineages.contains(k));
                self.lineage_negotiations.retain(|(a, b), _|
                    alive_lineages.contains(a) && alive_lineages.contains(b));
            }
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;

        if self.tick_count % 6000 == 0 {
            let alive = self.organisms.iter().filter(|o| o.alive).count();
            let q_rows: usize = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| o.q_table.len())
                .sum();
            let food: usize = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| o.food_memory.len())
                .sum();
            let trust: usize = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| o.org_trust.len())
                .sum();
            let rss_kb = read_self_rss_kb_local();
            tracing::info!(target: "mem",
                "t{} alive={} q_rows={} food={} trust={} rss_mb={:.1}",
                self.tick_count, alive, q_rows, food, trust,
                rss_kb as f64 / 1024.0,
            );
        }

        let season = self.season();
        self.physics.growth_mult = season_growth(season);

        if self.tick_count % 5 == 0 {
            let wet = self.weather.is_wet(self.tick_count);
            self.physics.tick(&mut self.grid, &mut self.rng, self.weather.kind, wet);
        }

        let phase = self.tick_count % DAY_LENGTH;

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

        if self.tick_count % 500 == 0 {
            self.grid.decay_world_layers();
        }

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

        if self.tick_count % 1200 == 600 {
            self.tick_settlements();
        }

        growth::deliver_births(&mut self.organisms, self.tick_count,
                               &mut self.events, &mut self.history);

        if self.tick_count % DAY_LENGTH == 0 {
            let alive = self.organisms.iter().filter(|o| o.alive).count() as u64;
            self.pop_history.push_back([self.tick_count, alive]);
            if self.pop_history.len() > 1000 { self.pop_history.pop_front(); }
            self.sample_lineage_centroids();
        }

        if self.tick_count % 60 == 0 && !self.lineage_centroid_history.is_empty() {
            self.tick_ancestral_recognition();
        }

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
            let tc = self.tick_count;
            for org in self.organisms.iter_mut() {
                let was_elder = org.is_elder;
                org.is_elder = elder_ids.contains(&org.id);
                if org.is_elder && !was_elder {
                    org.log_life(tc, "achievement", "became the elder of my people".to_string());
                }
            }
        }

        let alive_count_before_loop = self.organisms.iter().filter(|o| o.alive).count();

        let mut lineage_counts: HashMap<String, usize> = HashMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            *lineage_counts.entry(o.lineage_id.clone()).or_insert(0) += 1;
        }

        // Sparse-region check: split the world into a 3×3 grid of quadrants
        // and count alive orgs per cell. If half or more quadrants hold
        // ≤6 orgs, the world is heavily clumped and a fresh immigrant tribe
        // somewhere remote can correct the distribution.
        let sparse_quadrants = {
            const QX: i32 = 3;
            const QY: i32 = 3;
            let qw = WIDTH  as f32 / QX as f32;
            let qh = HEIGHT as f32 / QY as f32;
            let mut counts = [[0u32; QX as usize]; QY as usize];
            for o in self.organisms.iter().filter(|o| o.alive) {
                let cx = ((o.x / qw).floor() as i32).clamp(0, QX - 1);
                let cy = ((o.y / qh).floor() as i32).clamp(0, QY - 1);
                counts[cy as usize][cx as usize] += 1;
            }
            counts.iter().flatten().filter(|&&n| n <= 6).count()
        };
        let world_is_clumped = sparse_quadrants >= 5;
        let immig_cooldown = if alive_count_before_loop < 60 {
            Some(200u64)
        } else if alive_count_before_loop < 100 {
            Some(600u64)
        } else if world_is_clumped {
            Some(1500u64)
        } else {
            None
        };
        if let Some(cd) = immig_cooldown {
            if self.tick_count - self.last_immigration_tick >= cd {
                self.spawn_immigrant_tribe();
                self.last_immigration_tick = self.tick_count;
            }
        }

        let spatial = SpatialIndex::build(&self.organisms, 10);
        for i in 0..self.organisms.len() {
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                self.tick_organism(i, alive_count_before_loop, &lineage_counts, &spatial);

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

                                if !self.organisms[epos].life_log.is_empty() {
                                    let elder_name = self.organisms[epos].name.clone();
                                    let elder_id   = self.organisms[epos].id.clone();
                                    let life_top: Vec<String> = self.organisms[epos].life_log
                                        .iter().take(4).map(|e| e.text.clone()).collect();
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

        const VEL_EMA_ALPHA: f32 = 0.4;
        const MAX_PER_TICK:  f32 = 2.0;
        for o in self.organisms.iter_mut() {
            if !o.alive { continue; }
            let inst_vx = o.x - o.prev_x;
            let inst_vy = o.y - o.prev_y;
            o.prev_x = o.x;
            o.prev_y = o.y;
            if inst_vx.abs() > MAX_PER_TICK || inst_vy.abs() > MAX_PER_TICK {
                o.vx_smooth = 0.0;
                o.vy_smooth = 0.0;
                continue;
            }
            o.vx_smooth = VEL_EMA_ALPHA * inst_vx + (1.0 - VEL_EMA_ALPHA) * o.vx_smooth;
            o.vy_smooth = VEL_EMA_ALPHA * inst_vy + (1.0 - VEL_EMA_ALPHA) * o.vy_smooth;
        }

        if self.tick_count % 1200 == 0 {
            let dead_count = self.organisms.iter().filter(|o| !o.alive).count();
            const RECENT_DEAD_FULL: usize = 300;
            const MAX_ARCHIVE: usize       = 800;
            if dead_count > RECENT_DEAD_FULL {
                let to_compress = dead_count - RECENT_DEAD_FULL;
                let mut compressed = 0usize;
                for o in self.organisms.iter_mut() {
                    if compressed >= to_compress { break; }
                    if !o.alive && !o.q_table.is_empty() {
                        o.compress_for_archive();
                        compressed += 1;
                    }
                }
            }
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
        let epsilon = (0.30 - self.organisms[idx].age as f32 * 0.00005).max(0.08);

        let prev_energy    = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;

        {
            let org = &self.organisms[idx];
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

        // Passive territory: organisms gradually stamp their lineage onto land they inhabit.
        // Those with borders/territory discovery claim a wider radius around home.
        if self.tick_count % 40 == (idx as u64 % 40) {
            let has_borders = self.organisms[idx].discoveries.contains("territory")
                || self.organisms[idx].discoveries.contains("borders");
            let (hx, hy) = (self.organisms[idx].home_x as i32, self.organisms[idx].home_y as i32);
            let lid = self.organisms[idx].lineage_id.clone();
            let radius = if has_borders { 4 } else { 1 };
            self.claim_territory(&lid, hx, hy, radius);
        }

        // Rival territory pressure: being on a rival's claimed tile
        // degrades attitude. The inverse map (tile_owner) makes this
        // an O(1) lookup instead of an O(L × T_avg) scan of every
        // lineage's claimed tile set.
        {
            let (ox_i, oy_i) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let rival_lid: Option<String> = self.tile_owner.get(&(ox_i, oy_i))
                .filter(|lid| lid.as_str() != self.organisms[idx].lineage_id)
                .cloned();
            if let Some(rival) = rival_lid {
                let att = self.organisms[idx].lineage_attitudes.entry(rival).or_insert(0.0);
                *att = (*att - 0.002).max(-1.0);
            }
        }

        let animal_near = {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            self.animals.iter().any(|a| a.alive && (a.x - ox).abs() + (a.y - oy).abs() <= 8.0)
        };
        let perception = self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near, spatial);
        self.validate_or_assign_wander_target(idx);

        let hungry = self.organisms[idx].energy < 0.55;
        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let fear_trait = self.organisms[idx].traits.fear;

        // Wolf flee: instinctive - higher fear trait = larger detection radius
        let wolf_flee_radius = 6.0 + fear_trait * 8.0;
        let wolf_threat = self.animals.iter()
            .filter(|a| a.alive && matches!(a.kind, AnimalKind::Wolf))
            .map(|a| ((a.x - ox).abs() + (a.y - oy).abs(), a.x, a.y))
            .filter(|&(d, _, _)| d <= wolf_flee_radius)
            .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let prey_nearby = if hungry && wolf_threat.is_none() {
            self.animals.iter()
                .filter(|a| a.alive && !matches!(a.kind, AnimalKind::Wolf))
                .map(|a| ((a.x - ox).abs() + (a.y - oy).abs(), a.x, a.y))
                .filter(|&(d, _, _)| d <= 6.0)
                .min_by(|(a,_,_),(b,_,_)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        } else {
            None
        };

        // Need-driven construction: during storms, organisms with wood and no nearby shelter
        // urgently build wherever they're standing if the tile allows it.
        let storm_build: Option<(usize, Option<String>)> = if self.weather.kind >= 2
            && self.organisms[idx].inv_wood >= 1
        {
            let (bx, by) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let shelter_nearby = (-3i32..=3).any(|dx| (-3i32..=3).any(|dy|
                matches!(self.grid.get(bx + dx, by + dy), Tile::Hut | Tile::Rock)));
            if !shelter_nearby {
                let tile = self.grid.get(bx, by);
                if matches!(tile, Tile::Grass | Tile::Sand | Tile::Snow) {
                    Some((49, Some("must build shelter now!".to_string())))
                } else { None }
            } else { None }
        } else { None };

        let (action, new_thought): (usize, Option<String>) = if let Some(sb) = storm_build {
            sb
        } else if let Some((_, wx, wy)) = wolf_threat {
            let fdx = (ox - wx).signum();
            let fdy = (oy - wy).signum();
            let dir = match (fdx as i32, fdy as i32) {
                ( 0, -1) => 0, ( 0,  1) => 1, (-1,  0) => 2, ( 1,  0) => 3,
                (-1, -1) => 4, ( 1, -1) => 5, (-1,  1) => 6, ( 1,  1) => 7,
                _        => 0,
            };
            // Set a distant flee target so they keep running after the wolf leaves range
            let flee_dist = 20.0 + fear_trait * 30.0;
            let tx = ((ox + fdx * flee_dist).round() as i32)
                .clamp(5, crate::world::grid::WIDTH  as i32 - 5);
            let ty = ((oy + fdy * flee_dist).round() as i32)
                .clamp(5, crate::world::grid::HEIGHT as i32 - 5);
            self.organisms[idx].wander_target = Some((tx, ty));
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.12).min(1.0);
            // Burn wolf location into danger memory
            let wx_i = wx as i32; let wy_i = wy as i32;
            let prev = self.organisms[idx].danger_memory.get(&(wx_i, wy_i)).copied().unwrap_or(0.0);
            self.organisms[idx].danger_memory.insert((wx_i, wy_i), (prev + 0.4).min(1.0));
            (dir, Some("wolf! run!".to_string()))
        } else if let Some((_, ax, ay)) = prey_nearby {
            let dx = (ax - ox).signum();
            let dy = (ay - oy).signum();
            let dir = match (dx as i32, dy as i32) {
                ( 0, -1) => 0, ( 0,  1) => 1, (-1,  0) => 2, ( 1,  0) => 3,
                (-1, -1) => 4, ( 1, -1) => 5, (-1,  1) => 6, ( 1,  1) => 7,
                _        => 3,
            };
            (dir, Some("stalking prey".to_string()))
        } else {
            let (oa_ix, oa_iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let avail = crate::sim::actions::available_actions(&self, idx, oa_ix, oa_iy);
            self.organisms[idx].choose_action(
                &self.grid, self.tick_count, epsilon, &self.organisms, night,
                self.weather.kind, &mut self.rng, animal_near, &perception, &avail)
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
                self.broadcast_discovery(idx, cx, cy, "food", 8, spatial);
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
                self.broadcast_discovery(idx, cx, cy, "water", 8, spatial);
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
            if self.organisms[idx].carrying == 0 {
                let tile = self.grid.get(ix, iy);
                let rock_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
                    .iter().any(|&(dx, dy)| matches!(self.grid.get(ix+dx, iy+dy), Tile::Rock));
                if rock_near {
                    self.organisms[idx].carrying      = 200;
                    self.organisms[idx].carrying_type = 2;
                    signal_reward += 0.004;
                    self.organisms[idx].think("gathering stone", self.tick_count);
                    let name = self.organisms[idx].name.clone();
                    if self.organisms[idx].discover("stone") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "found stone");
                    }
                } else if matches!(tile, Tile::Grass | Tile::Food) {
                    self.organisms[idx].carrying      = 250;
                    self.organisms[idx].carrying_type = 1;
                    signal_reward += 0.004;
                    self.organisms[idx].think("gathering wood", self.tick_count);
                    self.organisms[idx].discover("wood");
                }
            }
        } else if action == 15 {
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
            if self.tick_count - self.organisms[idx].last_groomed >= 60 {
                signal_reward += social::groom(idx, &mut self.organisms,
                                               self.tick_count, &mut self.events);
            }
        } else if action == 18 {
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
            let o = &mut self.organisms[idx];
            o.fear_level = (o.fear_level - 0.06).max(0.0);
            o.boredom    = (o.boredom - 0.04).max(0.0);
            o.sleep_debt = (o.sleep_debt - 0.03).max(0.0);
            o.comfort    = (o.comfort + 0.04).min(1.0);
            if o.grief_ticks > 0 { o.grief_ticks = o.grief_ticks.saturating_sub(2); }
            o.think("reflecting quietly", self.tick_count);
            signal_reward += 0.002;
        } else if action == 23 {
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
            self.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
            self.grid.add_structure(ix, iy, 0.02);
            self.active_structure_tiles.insert((ix, iy));
            self.organisms[idx].think("marking territory", self.tick_count);
            signal_reward += 0.002;
        } else if action >= 26 {
            if let Some(r) = super::actions::try_apply(self, idx, action, ix, iy, spatial) {
                signal_reward += r;
                self.organisms[idx].energy =
                    (self.organisms[idx].energy - 0.0015).max(0.0);
            }
        }

        let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let current_tile = self.grid.get(cx, cy);

        if current_tile == Tile::Fire {
            let fire_dmg = 0.08 * (1.5 - self.organisms[idx].traits.resilience);
            let fire_dmg = if night { fire_dmg * 0.5 } else { fire_dmg };
            if night { self.organisms[idx].health = (self.organisms[idx].health + 0.0005).min(1.0); }
            self.organisms[idx].health = (self.organisms[idx].health - fire_dmg).max(0.0);
            self.grid.add_hazard(cx, cy, 0.025);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, cx, cy, 0.8, ms);
            self.organisms[idx].think("heat dangerous", self.tick_count);
            self.broadcast_discovery(idx, cx, cy, "danger", 12, spatial);
            if self.rng.gen::<f32>() < 0.15 * (1.0 - self.organisms[idx].traits.resilience) {
                self.organisms[idx].infection =
                    (self.organisms[idx].infection + 0.02).min(1.0);
            }
        }

        if current_tile == Tile::Water {
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].water_memory, cx, cy, 0.2, ms);
        }
        if current_tile == Tile::Food {
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].food_memory, cx, cy, 0.2, ms);
        }

        if self.organisms[idx].carrying > 0 {
            self.organisms[idx].carrying -= 1;
            if self.organisms[idx].carrying == 0 {
                self.organisms[idx].carrying_type = 0;
            }
        }

        if self.organisms[idx].carrying > 0 {
            let tile = self.grid.get(cx, cy);
            if matches!(tile, Tile::Grass | Tile::Food | Tile::Ash | Tile::Hut | Tile::Snow | Tile::Sand) {
                let prev_s = self.grid.structure_at(cx, cy);
                let has_masonry = self.organisms[idx].discoveries.contains("masonry");
                let deposit = match (self.organisms[idx].carrying_type, has_masonry) {
                    (2, true)  => 0.0090,
                    (2, false) => 0.0060,
                    _          => 0.0035,
                };
                self.grid.add_structure(cx, cy, deposit);
                self.active_structure_tiles.insert((cx, cy));
                let new_s = self.grid.structure_at(cx, cy);
                let name = self.organisms[idx].name.clone();
                if prev_s < 0.35 && new_s >= 0.35 {
                    push_event(&mut self.events, self.tick_count, "build", &name, "a crude shelter took shape");
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
            let energy_bonus = 0.0008 + shelter_strength * 0.0022;
            self.organisms[idx].energy = (self.organisms[idx].energy + energy_bonus).min(1.0);

            let health_regen = 0.0006 + shelter_strength * 0.0010;
            self.organisms[idx].health = (self.organisms[idx].health + health_regen).min(1.0);

            if self.organisms[idx].infection > 0.01 {
                let inf_mult = 0.992 - shelter_strength * 0.006;
                self.organisms[idx].infection =
                    (self.organisms[idx].infection * inf_mult.max(0.980)).max(0.0);
            }

            if self.organisms[idx].fear_level > 0.0 {
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level - shelter_strength * 0.008).max(0.0);
            }

            if self.organisms[idx].grief_ticks > 0 && self.rng.gen::<f32>() < shelter_strength * 0.12 {
                self.organisms[idx].grief_ticks =
                    self.organisms[idx].grief_ticks.saturating_sub(3);
            }

        }

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

        if self.organisms[idx].hydration < 0.55 && self.organisms[idx].inv_water > 0
            && self.tick_count % 8 == 0
        {
            self.organisms[idx].inv_water -= 1;
            self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.18).min(1.0);
        }

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
            let night_base = if has_torch { 0.0002 } else { 0.0005 };
            let night_drain = night_base * shelter_drain_mult;
            self.organisms[idx].energy = (self.organisms[idx].energy - night_drain).max(0.0);
        }

        let temp = self.grid.temp_at(cx, cy);
        let resilience = self.organisms[idx].traits.resilience;
        if temp < 10.0 || temp > 30.0 {
            let stress = if temp < 10.0 { (10.0 - temp) / 40.0 } else { (temp - 30.0) / 70.0 };
            let temp_shelter = 1.0 - shelter_strength * 0.60;
            let drain = stress * 0.003 * (1.1 - resilience * 0.2) * temp_shelter;
            self.organisms[idx].energy = (self.organisms[idx].energy - drain).max(0.0);
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

        if self.organisms[idx].infection > 0.01 {
            let med_mult = if self.organisms[idx].discoveries.contains("medicine") {
                0.990
            } else {
                0.997
            };
            self.organisms[idx].infection = (self.organisms[idx].infection * med_mult).max(0.0);
        }

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

        {
            use crate::world::tiles::Biome;
            let biome = self.grid.biome_at(
                self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let pathogen_rate = match biome {
                Biome::Wetland => 0.00050,
                Biome::Volcanic => 0.00020,
                _ => 0.00012,
            };
            if self.organisms[idx].infection < 0.05 && self.rng.gen::<f32>() < pathogen_rate {
                self.organisms[idx].infection =
                    0.35 * (1.0 - self.organisms[idx].traits.resilience * 0.4);
            }
        }

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
            self.organisms[idx].decay_memory(self.tick_count);
        }

        let mut reward = (self.organisms[idx].energy    - prev_energy)    * 2.0
                       + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        if current_tile == Tile::Fire { reward -= 0.5; }

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
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

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

        // Inline fold - no Vec allocation per organism per tick.
        let (kin_sum, kin_count) = self.organisms.iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .fold((0.0f32, 0u32), |(s, n), o| (s + o.energy, n + 1));
        if kin_count >= 3 && self.organisms[idx].energy > 0.4 {
            let avg = kin_sum / kin_count as f32;
            reward += 0.003 * (avg - 0.5).max(0.0);
        }

        reward += signal_reward;

        let loneliness = self.organisms[idx].loneliness;
        let boredom    = self.organisms[idx].boredom;
        let comfort    = self.organisms[idx].comfort;
        if loneliness > 0.5 && signal_reward > 0.0 {
            reward += loneliness * 0.015;
        }
        if boredom > 0.4 && matches!(action, 14 | 15 | 16 | 0..=7) {
            reward += boredom * 0.008;
        }
        if comfort > 0.75 {
            reward += (comfort - 0.75) * 0.01;
        }

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

        let next_perception = self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near, spatial);
        self.organisms[idx].learn(&perception, action, reward, &next_perception);

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
                        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
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

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);

            let unknown_lid: Option<String> = self.organisms.iter()
                .filter(|o| o.alive && o.lineage_id != my_lid)
                .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 5.0)
                .filter(|o| !self.organisms[idx].lineage_attitudes.contains_key(&o.lineage_id))
                .map(|o| o.lineage_id.clone())
                .next();
            if let Some(stranger_lid) = unknown_lid {
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

            let last_council = *self.lineage_last_council.get(&my_lid).unwrap_or(&0);
            if self.tick_count - last_council >= 6000 {
                let (kin_sum, kin_count) = self.organisms.iter()
                    .filter(|o| o.alive && o.lineage_id == my_lid)
                    .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
                    .fold((0.0f32, 0u32), |(s, n), o| (s + o.energy, n + 1));
                if kin_count >= 5 {
                    let avg = kin_sum / kin_count as f32;
                    if avg > 0.7 {
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
                            kin_count:  kin_count as usize,
                            energy_avg: avg,
                            context:    elder_ctx,
                            ..Default::default()
                        });
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 4000 {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy     = self.organisms[idx].energy;
                let hydration  = self.organisms[idx].hydration;

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

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 3000 && self.organisms[idx].energy < 0.18 {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_partner = self.organisms[idx].partner_id.clone();
                let tempting = self.organisms.iter()
                    .find(|o| o.alive
                        && o.id != self.organisms[idx].id
                        && o.inv_food > 0
                        && o.lineage_id != my_lid
                        && Some(&o.id) != my_partner.as_ref()
                        && (o.x - ox2).abs() + (o.y - oy2).abs() <= 4.0)
                    .map(|o| o.name.clone());
                if let Some(other_name) = tempting {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(idx, ThinkTrigger {
                        org_id:     self.organisms[idx].id.clone(),
                        org_name:   self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario:   "moral_dilemma".to_string(),
                        energy_avg: self.organisms[idx].energy,
                        context:    format!("starving, nearby {} carries food", other_name),
                        ..Default::default()
                    });
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 4000 {
                if let Some(partner_id) = self.organisms[idx].partner_id.clone() {
                    let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                    let my_id   = self.organisms[idx].id.clone();
                    let my_sex  = self.organisms[idx].sex;
                    let partner = self.organisms.iter()
                        .find(|o| o.alive && o.id == partner_id
                            && (o.x - ox2).abs() + (o.y - oy2).abs() <= 5.0)
                        .map(|o| (o.name.clone(), o.x, o.y));
                    if let Some((partner_name, px, py)) = partner {
                        let third = self.organisms.iter()
                            .find(|o| o.alive
                                && o.id != my_id
                                && o.id != partner_id
                                && o.sex != my_sex
                                && (o.x - px).abs() + (o.y - py).abs() <= 5.0)
                            .map(|o| o.name.clone());
                        if let Some(third_name) = third {
                            self.organisms[idx].last_think_tick = self.tick_count;
                            self.push_think_for(idx, ThinkTrigger {
                                org_id:     self.organisms[idx].id.clone(),
                                org_name:   self.organisms[idx].name.clone(),
                                lineage_id: my_lid.clone(),
                                scenario:   "jealousy".to_string(),
                                energy_avg: self.organisms[idx].energy,
                                context:    format!("{} lingers near {}", third_name, partner_name),
                                ..Default::default()
                            });
                        }
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 6000 {
                use crate::organism::organism::Sex;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_id   = self.organisms[idx].id.clone();
                let my_sex  = self.organisms[idx].sex;
                let my_age  = self.organisms[idx].age;
                let my_eng  = self.organisms[idx].energy;
                if my_sex == Sex::Male && my_age > 1200 && my_eng > 0.4 {
                    let rival = self.organisms.iter()
                        .find(|o| o.alive
                            && o.id != my_id
                            && o.sex == Sex::Male
                            && o.lineage_id == my_lid
                            && o.age > 1200
                            && o.energy > 0.4
                            && (o.x - ox2).abs() + (o.y - oy2).abs() <= 6.0)
                        .map(|o| o.name.clone());
                    if let Some(other_name) = rival {
                        self.organisms[idx].last_think_tick = self.tick_count;
                        self.push_think_for(idx, ThinkTrigger {
                            org_id:     self.organisms[idx].id.clone(),
                            org_name:   self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario:   "rivalry".to_string(),
                            energy_avg: my_eng,
                            context:    format!("brother {} threatens", other_name),
                            ..Default::default()
                        });
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 8000
               && self.organisms[idx].age > 2000
               && self.organisms[idx].energy < 0.30
               && self.drought.active
            {
                self.organisms[idx].last_think_tick = self.tick_count;
                self.push_think_for(idx, ThinkTrigger {
                    org_id:     self.organisms[idx].id.clone(),
                    org_name:   self.organisms[idx].name.clone(),
                    lineage_id: my_lid.clone(),
                    scenario:   "migration_urge".to_string(),
                    energy_avg: self.organisms[idx].energy,
                    context:    "land starves; old paths fail".to_string(),
                    ..Default::default()
                });
            }

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

            if self.tick_count - self.organisms[idx].last_invention_tick >= 5000
               && self.organisms[idx].age > 400
            {
                let disc = &self.organisms[idx].discoveries;
                let candidates = invention_candidates(disc);
                if !candidates.is_empty() {
                    self.organisms[idx].last_invention_tick = self.tick_count;
                    let disc_vec: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                    let life_top: Vec<String> = self.organisms[idx].life_log.iter()
                        .rev().take(3).map(|e| e.text.clone()).collect();
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

            if night && !self.organisms[idx].has_reflected
               && self.organisms[idx].age > 800
               && self.organisms[idx].life_log.len() >= 4
            {
                self.organisms[idx].has_reflected = true;
                let life_top: Vec<String> = self.organisms[idx].life_log.iter()
                    .take(5).map(|e| e.text.clone()).collect();
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

        if self.organisms[idx].energy > 0.82
           && self.tick_count - self.organisms[idx].last_fed_kin >= 180
        {
            social::share_food(idx, &mut self.organisms, self.tick_count, &mut self.events);
        }

        // Any organism with knowledge can teach nearby kin - not just elders.
        // Stagger by idx so not all organisms try to teach on the same tick.
        let can_teach = !self.organisms[idx].discoveries.is_empty() || self.organisms[idx].is_elder;
        if can_teach && self.tick_count % 120 == (idx as u64 % 120) {
            social::teach(idx, &mut self.organisms, self.tick_count, &mut self.events, &mut self.rng);
        }

        if self.tick_count % 2000 == (idx as u64 % 2000) {
            {
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
            check_earned_attributes(&mut self.organisms[idx]);
        }

        let season = self.season();
        if scarcity_driven_migration_season(season) {
            let (ox2, oy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_near = (-8i32..=8).any(|ddx| (-8i32..=8).any(|ddy|
                self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near && self.organisms[idx].food_memory.len() < 8
               && self.rng.gen::<f32>() < 0.0015
            {
                if self.organisms[idx].wander_target.is_none() && self.organisms[idx].energy > 0.4 {
                    let hash = self.tick_count ^ idx as u64;
                    let tx = (ox2 + ((hash % 40) as i32 - 20)).clamp(5, WIDTH as i32 - 5);
                    let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).clamp(5, HEIGHT as i32 - 5);
                    self.organisms[idx].wander_target = Some((tx, ty));
                    self.organisms[idx].think("migrating for food", self.tick_count);
                }
            }
        }

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

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let partner_pos = self.organisms.iter().position(|o| &o.id == pid);
            let dead = partner_pos.map(|p| !self.organisms[p].alive).unwrap_or(true);
            if dead {
                let partner_name = partner_pos
                    .map(|p| self.organisms[p].name.clone())
                    .unwrap_or_else(|| "partner".to_string());
                let tc = self.tick_count;
                let pid_owned = pid.clone();
                self.organisms[idx].partner_id = None;
                self.organisms[idx].grief_ticks = (self.organisms[idx].grief_ticks + 120).min(300);
                self.organisms[idx].log_life_rel(tc, "loss",
                    format!("lost my beloved {}", partner_name),
                    Some(pid_owned), Some(partner_name));
            }
        }
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

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.organisms[idx].wander_target.is_none()
            && self.organisms[idx].loneliness > 0.20
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex   = self.organisms[idx].sex;
            let my_age   = self.organisms[idx].age as f32;
            let my_lid   = self.organisms[idx].lineage_id.clone();
            let my_atts  = self.organisms[idx].lineage_attitudes.clone();
            let my_trust = self.organisms[idx].org_trust.clone();
            // Score candidates by attitude / trust / age compat, not raw
            // proximity. Distance still matters (you have to walk there),
            // but two villagers who hate each other's lineages no longer
            // pair just because they happen to be the closest neighbour.
            // Hard distance cap on mate search - same reasoning as the
            // friend-seek cap. Without it, attraction can pull orgs
            // across the entire map, defeating the cluster-breaking
            // work in spawn.rs / friend-seek.
            const MATE_SEEK_MAX_TILES: f32 = 80.0;
            let target = self.organisms.iter()
                .filter(|o| o.alive && o.sex != my_sex && o.age > 1000 && o.partner_id.is_none())
                .map(|o| {
                    let dist = (o.x - ox).hypot(o.y - oy);
                    (o, dist)
                })
                .filter(|(_, d)| *d <= MATE_SEEK_MAX_TILES)
                .map(|(o, dist)| {
                    let lineage_att = if o.lineage_id == my_lid { 0.3 }
                        else { my_atts.get(&o.lineage_id).copied().unwrap_or(0.0) };
                    let trust = my_trust.get(&o.id).copied().unwrap_or(0.0);
                    let age_gap = (my_age - o.age as f32).abs();
                    let age_score = (1.0 - age_gap / 6000.0).clamp(0.0, 1.0);
                    let dist_score = (1.0 - dist / 30.0).clamp(0.0, 1.0);
                    // Hard-reject hostile lineages even if nearby.
                    let viable = lineage_att > -0.3;
                    let score = if viable {
                        dist_score * 0.35 + lineage_att * 0.25 + trust * 0.20 + age_score * 0.20
                    } else { -1.0 };
                    (o, score)
                })
                .filter(|(_, s)| *s > 0.0)
                .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(o, _)| (o.x as i32, o.y as i32));
            if let Some((tx, ty)) = target {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        // Friend-seeking: lonely organisms with friends actively walk toward one
        if self.organisms[idx].loneliness > 0.65
            && self.organisms[idx].wander_target.is_none()
            && !self.organisms[idx].friends.is_empty()
            && self.organisms[idx].energy > 0.30
        {
            let friend_ids: Vec<String> = self.organisms[idx].friends.keys().cloned().collect();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            // Only walk toward friends within this radius. Without a cap,
            // every lonely org in the world eventually drifts toward whichever
            // cluster has the densest friend network, producing a one-way
            // attractor that empties out the rest of the map.
            const FRIEND_SEEK_MAX_TILES: f32 = 60.0;
            let best = friend_ids.iter()
                .filter_map(|fid| self.organisms.iter().find(|o| o.alive && &o.id == fid))
                .map(|o| (o, (o.x - ox).hypot(o.y - oy)))
                .filter(|(_, d)| *d <= FRIEND_SEEK_MAX_TILES)
                .min_by_key(|(_, d)| (*d * 10.0) as i32)
                .map(|(o, _)| (o.x as i32, o.y as i32, o.name.clone()));
            if let Some((tx, ty, fname)) = best {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
                let short = &fname[..4.min(fname.len())];
                self.organisms[idx].think(&format!("going to find {}", short), self.tick_count);
            }
            // Prune dead friends from the list
            let alive_ids: std::collections::HashSet<String> = self.organisms.iter()
                .filter(|o| o.alive).map(|o| o.id.clone()).collect();
            self.organisms[idx].friends.retain(|id, _| alive_ids.contains(id));
        }

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
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let b_recent: Vec<String> = self.organisms[pi].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx], &self.organisms[pi],
                            a_recent, b_recent, a_tribe, b_tribe, a_mood, b_mood,
                            tc, "courtship", &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.pending_convos.push(req);
                        self.organisms[idx].partner_id   = Some(pid.clone());
                        self.organisms[idx].attracted_to = None;
                        self.organisms[pi].partner_id    = Some(oid.clone());
                        self.organisms[pi].attracted_to  = None;
                        self.organisms[idx].think(&format!("fell for {}", pname), tc);
                        self.organisms[idx].log_life_rel(tc, "love",
                            format!("fell in love with {}", pname),
                            Some(pid.clone()), Some(pname.clone()));
                        self.organisms[pi].log_life_rel(tc, "love",
                            format!("fell in love with {}", oname),
                            Some(oid), Some(oname.clone()));
                    }
                }
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let pid = pid.clone();
            if tc % 19 == (idx as u64 % 19) && self.rng.gen::<f32>() < 0.0018 {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                if let Some(pi) = self.organisms.iter().position(|o| o.alive && o.id == pid) {
                    if (self.organisms[pi].x - ox).hypot(self.organisms[pi].y - oy) < 8.0 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let b_recent: Vec<String> = self.organisms[pi].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx], &self.organisms[pi],
                            a_recent, b_recent, a_tribe, b_tribe, a_mood, b_mood,
                            tc, "bonded", &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.pending_convos.push(req);
                    }
                }
            }
        }

        {
            let spread_check = tc % 29 == (idx as u64 % 29);
            if spread_check {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
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
                    let combined_energy = self.organisms[idx].energy + self.organisms[ci].energy;
                    let kind = if att < -0.3 {
                        "argue"
                    } else if combined_energy > 1.5 && att >= 0.0 {
                        "excited"
                    } else {
                        "chat"
                    };
                    if self.rng.gen::<f32>() < 0.004 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[ci]);
                        let a_recent: Vec<String> = self.organisms[idx].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let b_recent: Vec<String> = self.organisms[ci].life_log.iter().rev().take(3).map(|e| e.text.clone()).collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[ci].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx], &self.organisms[ci],
                            a_recent, b_recent, a_tribe, b_tribe, a_mood, b_mood,
                            tc, kind, &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[ci].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[ci].store_conversation(conv_b);
                        self.pending_convos.push(req);
                    }
                }
            }
        }

        growth::try_reproduce(idx, &mut self.organisms, &self.grid,
                              self.tick_count, &mut self.events, &mut self.history,
                              &mut self.rng, alive_count, lineage_counts);

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
            // Migration-pressure signal: an organism dying far from
            // where it was born is the simulation's emergent answer
            // to "the elders left home and never came back." Fires
            // sparingly (only at death, only past a sizeable
            // threshold) so the event log doesn't drown.
            let dx = org.x - org.home_x;
            let dy = org.y - org.home_y;
            let home_dist_sq = dx * dx + dy * dy;
            let migrated = home_dist_sq > 40.0 * 40.0;
            let msg = format!("gen{} age {} - {}", org.generation, org.age, cause);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
            if migrated {
                let dist = home_dist_sq.sqrt() as i32;
                push_event(&mut self.events, self.tick_count, "migration", &name,
                           &format!("died {} tiles from home, far from where they were born", dist));
            }
        } else if org.max_age > 0 && org.age >= org.max_age {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            let msg = format!("gen{} age {} - old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        if let Some((dx, dy, dlid)) = death_grief {
            let dead_name = self.organisms[idx].name.clone();
            let dead_id_str = self.organisms[idx].id.clone();
            // Grievers: same-lineage tile-neighbours (original)
            //         + adult children regardless of distance (father_id / parent_id match)
            //         + named friends regardless of distance
            // Without these, a parent's death didn't reach their
            // distant children or cross-tribe friends.
            let mut griever_set: std::collections::HashSet<usize> = std::collections::HashSet::new();
            for (i, o) in self.organisms.iter().enumerate() {
                if i == idx || !o.alive { continue }
                let near_kin = o.lineage_id == dlid
                    && (o.x as i32 - dx).abs() + (o.y as i32 - dy).abs() <= 12;
                let child = o.parent_id == dead_id_str
                    || o.father_id.as_deref() == Some(dead_id_str.as_str());
                let friend = o.friends.contains_key(&dead_id_str);
                if near_kin || child || friend {
                    griever_set.insert(i);
                }
            }
            let grievers: Vec<usize> = griever_set.into_iter().collect();

            let griever_count = grievers.len();

            let inherited_food: Vec<((i32, i32), f32)> = self.organisms[idx].food_memory.iter()
                .filter(|(_, &v)| v > 0.5).take(5).map(|(&k, &v)| (k, v)).collect();
            let inherited_water: Vec<((i32, i32), f32)> = self.organisms[idx].water_memory.iter()
                .filter(|(_, &v)| v > 0.5).take(5).map(|(&k, &v)| (k, v)).collect();
            let inherited_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();

            let dead_id = self.organisms[idx].id.clone();
            for gi in &grievers {
                let ms = self.organisms[*gi].traits.memory_strength;
                Organism::remember(&mut self.organisms[*gi].danger_memory, dx, dy, 0.65, ms);
                self.organisms[*gi].fear_level    = (self.organisms[*gi].fear_level + 0.22).min(1.0);
                // Children of the dead get heavier grief AND get marked
                // as orphaned for nearby kin to notice; adult mourners
                // get the original lighter grief.
                let is_child = (self.organisms[*gi].parent_id == dead_id_str
                    || self.organisms[*gi].father_id.as_deref() == Some(dead_id_str.as_str()))
                    && self.organisms[*gi].age < 1000;
                let grief_base = if is_child { 200 } else { 80 };
                if is_child {
                    self.organisms[*gi].orphaned_tick = self.tick_count;
                    self.organisms[*gi].add_anchor(
                        self.tick_count,
                        format!("lost parent {}", dead_name),
                        0.95,
                    );
                }
                self.organisms[*gi].grief_ticks   = grief_base + self.rng.gen_range(0u32..40);
                self.organisms[*gi].think("mourning kin", self.tick_count);
                let tc = self.tick_count;
                let dn = dead_name.clone();
                let di = dead_id.clone();
                self.organisms[*gi].log_life_rel(tc, "loss",
                    format!("witnessed {} die", dn),
                    Some(di), Some(dn));

                for &((mx, my), v) in &inherited_food {
                    Organism::remember(&mut self.organisms[*gi].food_memory, mx, my, v * 0.4, ms);
                }
                for &((mx, my), v) in &inherited_water {
                    Organism::remember(&mut self.organisms[*gi].water_memory, mx, my, v * 0.4, ms);
                }
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

            let ritual_participants: Vec<usize> = self.organisms.iter().enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == dlid
                    && (((o.x as i32 - dx).pow(2) + (o.y as i32 - dy).pow(2)) as f32).sqrt() <= 6.0)
                .map(|(i, _)| i)
                .collect();
            if !ritual_participants.is_empty() {
                let participant_ids: Vec<String> = ritual_participants.iter()
                    .map(|&pi| self.organisms[pi].id.clone()).collect();
                for (slot, &pi) in ritual_participants.iter().enumerate() {
                    self.organisms[pi].grief_ticks = self.organisms[pi].grief_ticks.saturating_sub(20);
                    self.organisms[pi].log_event("mourned together".to_string());
                    for (other_slot, other_id) in participant_ids.iter().enumerate() {
                        if other_slot == slot { continue }
                        let cur = self.organisms[pi].org_trust.get(other_id).copied().unwrap_or(0.0);
                        self.organisms[pi].org_trust.insert(other_id.clone(), (cur + 0.12).min(1.0));
                    }
                }
            }

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

            self.grid.add_hazard(dx, dy, 0.45);
            self.grid.reduce_fertility(dx, dy, 0.08);
            for (ndx, ndy) in [(-1i32,0),(1,0),(0,-1i32),(0,1)] {
                self.grid.add_hazard(dx+ndx, dy+ndy, 0.18);
                self.grid.reduce_fertility(dx+ndx, dy+ndy, 0.03);
            }
            for ddx in -2i32..=2 { for ddy in -2i32..=2 {
                if ddx.abs() + ddy.abs() == 2 {
                    self.grid.add_hazard(dx+ddx, dy+ddy, 0.06);
                }
            }}

            if self.rng.gen::<f32>() < 0.25 {
                if matches!(self.grid.get(dx, dy), Tile::Grass | Tile::Ash) {
                    self.grid.set(dx, dy, Tile::Food);
                }
            }
        }
    }

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
        // Passive respawn floor. Without this, a transient extinction
        // (drought + hunting + wolves eating prey then starving) leaves
        // the world animal-less forever, since reproduction requires
        // living parents. Every 600 ticks, if the population dipped
        // below the floor, drip-spawn some back.
        if self.tick_count > 0 && self.tick_count % 600 == 0 {
            let alive = self.animals.iter().filter(|a| a.alive).count();
            const ANIMAL_FLOOR: usize = 40;
            if alive < ANIMAL_FLOOR {
                let to_add = (ANIMAL_FLOOR - alive).min(10);
                self.spawn_animals(to_add);
            }
        }

        use crate::world::tiles::Biome;

        let org_pos: Vec<(f32, f32)> = self.organisms.iter()
            .filter(|o| o.alive)
            .map(|o| (o.x, o.y))
            .collect();

        for animal in &mut self.animals {
            animal.tick(&self.grid, &org_pos, &mut self.rng);
        }

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
                "befriended a wolf - it follows them now");
        }

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
        let mut to_catch: Vec<(usize, usize)> = Vec::new();
        let organism_spatial = SpatialIndex::build(&self.organisms, 10);
        let animal_spatial = SpatialIndex::build_animals(&self.animals, 10);
        let mut nearby_animals: Vec<usize> = Vec::with_capacity(16);
        for (oi, org) in self.organisms.iter().enumerate() {
            if !org.alive { continue; }
            let (ox, oy) = (org.x as i32, org.y as i32);
            animal_spatial.query_into(ox, oy, 3, &mut nearby_animals);
            for &ai in &nearby_animals {
                let animal = &self.animals[ai];
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

    fn broadcast_discovery(&mut self, actor_idx: usize, x: i32, y: i32,
                           rtype: &str, radius: i32, spatial: &SpatialIndex) {
        let (ax, ay) = (self.organisms[actor_idx].x, self.organisms[actor_idx].y);
        let mut buf: Vec<usize> = Vec::with_capacity(16);
        spatial.query_into(ax as i32, ay as i32, radius, &mut buf);
        for &i in &buf {
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

    fn tick_ancestral_recognition(&mut self) {
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
            if now.saturating_sub(self.organisms[idx].last_ancestral_thought) < COOLDOWN_TICKS {
                continue;
            }
            let org_lid = self.organisms[idx].lineage_id.clone();
            let ox = self.organisms[idx].x;
            let oy = self.organisms[idx].y;
            let Some(samples) = self.lineage_centroid_history.get(&org_lid) else { continue };
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
            let cx = (sx / n as f32) as i32;
            let cy = (sy / n as f32) as i32;
            let entry = self.lineage_centroid_history
                .entry(lid_str.to_string())
                .or_default();
            entry.push_back([tick, cx, cy]);
            if entry.len() > 60 { entry.pop_front(); }
            // Stamp the ancestral home the first time we ever see
            // this lineage. Never overwritten - even when the last
            // living member is 200 tiles away, the home stays
            // anchored to where the lineage was born.
            self.lineage_homes.entry(lid_str.to_string())
                .or_insert([cx, cy, 30]);
        }
        let cutoff = tick - 30 * DAY_LENGTH as i32;
        self.lineage_centroid_history.retain(|lid, samples| {
            if alive_lineages.contains(lid) { return true; }
            samples.back().map(|s| s[0] >= cutoff).unwrap_or(false)
        });
    }

    fn tick_settlements(&mut self) {
        const TIER_NAMES: [&str; 6] =
            ["wilderness", "camp", "hamlet", "village", "town", "city"];
        const THRESHOLDS: [usize; 6] = [0, 4, 10, 22, 40, 70];

        let mut built: Vec<(i32, i32)> = self.active_structure_tiles.iter()
            .filter(|&&(x, y)| {
                self.grid.structure_at(x, y) >= 0.35
                    || matches!(self.grid.get(x, y), Tile::Hut | Tile::Campfire)
            })
            .copied()
            .collect();
        if built.len() > 4000 { built.truncate(4000); }

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
                self.settlement_tiers.insert(lid.clone(), tier);
            }
        }
    }

    /// Claim all non-water tiles within `radius` of `(cx, cy)` for lineage `lid`.
    /// Caps each lineage at 400 tiles - evicts tiles farthest from the claimed center.
    pub(crate) fn claim_territory(&mut self, lid: &str, cx: i32, cy: i32, radius: i32) {
        const MAX_TERRITORY: usize = 400;
        // Pre-compute the tile list so we can update both maps without
        // holding two mutable borrows on `self` simultaneously.
        let mut to_claim: Vec<(i32, i32)> = Vec::new();
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy > radius * radius { continue; }
                let tx = (cx + dx).clamp(0, crate::world::grid::WIDTH  as i32 - 1);
                let ty = (cy + dy).clamp(0, crate::world::grid::HEIGHT as i32 - 1);
                if matches!(self.grid.get(tx, ty), Tile::Water | Tile::Void) { continue; }
                to_claim.push((tx, ty));
            }
        }
        let tiles = self.territory.entry(lid.to_string()).or_insert_with(HashSet::new);
        for p in &to_claim {
            tiles.insert(*p);
        }
        let mut evicted: Vec<(i32, i32)> = Vec::new();
        if tiles.len() > MAX_TERRITORY {
            let mut sorted: Vec<(i32, i32)> = tiles.iter().copied().collect();
            sorted.sort_by_key(|&(x, y)| -((x - cx) * (x - cx) + (y - cy) * (y - cy)));
            let excess = sorted.len() - MAX_TERRITORY;
            for p in sorted.into_iter().take(excess) {
                tiles.remove(&p);
                evicted.push(p);
            }
        }
        // Update the inverse map. New claims overwrite (most-recent
        // wins). Evictions only clear the inverse entry if it was
        // owned by *this* lineage - another lineage may have a more
        // recent claim on the same tile.
        for p in to_claim {
            self.tile_owner.insert(p, lid.to_string());
        }
        for p in evicted {
            if let Some(owner) = self.tile_owner.get(&p) {
                if owner == lid {
                    self.tile_owner.remove(&p);
                }
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

fn read_self_rss_kb_local() -> u64 {
    let s = match std::fs::read_to_string("/proc/self/status") {
        Ok(s) => s,
        Err(_) => return 0,
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            return rest.split_whitespace().next()
                .and_then(|n| n.parse().ok()).unwrap_or(0);
        }
    }
    0
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

        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-cooldown-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));

        let mut sim = Simulation::new(42);
        sim.tick_count = 50_000;
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].last_think_tick = 1_000;
        sim.organisms[idx].last_invention_tick = 2_000;
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
    fn viewport_state_includes_all_alive_when_viewport_spans_world() {
        // VP_W = WIDTH and VP_H = HEIGHT, so the in_view filter must
        // never drop entities just because the centroid is off-center.
        // (Previously a centroid-centered AABB could slide past the
        // world edge and silently exclude orgs / animals on the far
        // side. That caused "animals not showing" reports.)
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
        let ids: Vec<String> = state["organisms_hot"]["ids"].as_array().unwrap()
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        assert!(ids.contains(&near_id),  "centroid-local org must ship");
        assert!(ids.contains(&far_id),
            "with full-world viewport, the far-corner org must also ship");
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

            assert!(span_x >= WIDTH as f32 * 0.40,
                "seed {seed} founders span only {} of {} tiles wide", span_x, WIDTH);
            assert!(span_y >= HEIGHT as f32 * 0.30,
                "seed {seed} founders span only {} of {} tiles tall", span_y, HEIGHT);

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
    fn population_does_not_reconverge_after_many_sim_days() {
        let mut sim = Simulation::new(7);
        for _ in 0..30_000 {
            sim.tick();
        }
        let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
        assert!(alive.len() >= 60,
            "population collapsed to {} after 5 sim-days", alive.len());

        let cw = 60i32; let ch = 60i32;
        let mut buckets: std::collections::HashMap<(i32, i32), u32> = Default::default();
        for o in &alive {
            let cx = (o.x as i32) / cw;
            let cy = (o.y as i32) / ch;
            *buckets.entry((cx, cy)).or_insert(0) += 1;
        }
        let max_bucket = buckets.values().copied().max().unwrap_or(0) as f32;
        let frac = max_bucket / alive.len() as f32;
        assert!(frac <= 0.50,
            "at 30k ticks {:.0}% of population sits in a single 60x60 cell ({})", frac * 100.0, max_bucket as u32);
    }

    #[test]
    fn dense_animal_clusters_stop_reproducing() {
        let mut sim = Simulation::new(31);
        sim.animals.clear();
        for i in 0..20 {
            let mut a = Animal::new(i, 50.0, 50.0, AnimalKind::Rabbit);
            a.energy = 0.95;
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

    /// Friend-seek must respect the 60-tile distance cap. A lonely
    /// org with only far-away friends should NOT set a wander_target
    /// that pulls them across the map (the one-island attractor bug).
    #[test]
    fn lonely_org_with_only_distant_friends_stays_put() {
        use crate::organism::organism::{Organism, generate_name, Sex, apply_sex_traits};
        use crate::organism::traits::Traits;
        let mut sim = Simulation::new(0xdef0);
        // Wipe founders so we control the cast.
        sim.organisms.clear();

        // Lonely main org at (50, 50).
        let mut traits = Traits::random(&mut sim.rng);
        apply_sex_traits(&mut traits, Sex::Female);
        let mut me = Organism::new(
            "me-id".into(), generate_name(&mut sim.rng, Sex::Female),
            50.0, 50.0, 1, "".into(), "lid-a".into(), 20_000, traits,
        );
        me.alive = true;
        me.sex = Sex::Female;
        me.age = 1500;
        me.energy = 0.8;
        me.loneliness = 0.85;
        // Single named friend at (500, 250) - way past the 60-tile cap.
        me.friends.insert("far-id".into(), "FarFriend".into());
        sim.organisms.push(me);

        let mut friend_traits = Traits::random(&mut sim.rng);
        apply_sex_traits(&mut friend_traits, Sex::Male);
        let mut far = Organism::new(
            "far-id".into(), "FarFriend".into(),
            500.0, 250.0, 1, "".into(), "lid-b".into(), 20_000, friend_traits,
        );
        far.alive = true; far.sex = Sex::Male; far.age = 1500;
        sim.organisms.push(far);

        sim.tick_count = 5_000;

        // Drive the per-org tick to exercise the friend-seek block.
        let alive_count = 2;
        let mut lineage_counts = std::collections::HashMap::new();
        lineage_counts.insert("lid-a".into(), 1);
        lineage_counts.insert("lid-b".into(), 1);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        sim.tick_organism(0, alive_count, &lineage_counts, &spatial);

        assert!(sim.organisms[0].wander_target.is_none(),
            "lonely org with no in-range friends should NOT walk \
             toward a friend 600 tiles away - wander_target was {:?}",
            sim.organisms[0].wander_target);
    }

    /// And the opposite: a friend WITHIN the 60-tile cap should
    /// produce a wander_target pointing at them.
    #[test]
    fn lonely_org_with_nearby_friend_walks_toward_them() {
        use crate::organism::organism::{Organism, generate_name, Sex, apply_sex_traits};
        use crate::organism::traits::Traits;
        let mut sim = Simulation::new(0xdef1);
        sim.organisms.clear();

        let mut traits = Traits::random(&mut sim.rng);
        apply_sex_traits(&mut traits, Sex::Female);
        let mut me = Organism::new(
            "me-id".into(), generate_name(&mut sim.rng, Sex::Female),
            50.0, 50.0, 1, "".into(), "lid-a".into(), 20_000, traits,
        );
        me.alive = true; me.sex = Sex::Female; me.age = 1500;
        me.energy = 0.8; me.loneliness = 0.85;
        me.friends.insert("near-id".into(), "NearFriend".into());
        sim.organisms.push(me);

        let mut friend_traits = Traits::random(&mut sim.rng);
        apply_sex_traits(&mut friend_traits, Sex::Male);
        let mut near = Organism::new(
            "near-id".into(), "NearFriend".into(),
            70.0, 70.0, 1, "".into(), "lid-b".into(), 20_000, friend_traits,
        );
        near.alive = true; near.sex = Sex::Male; near.age = 1500;
        sim.organisms.push(near);

        sim.tick_count = 5_000;

        let mut lineage_counts = std::collections::HashMap::new();
        lineage_counts.insert("lid-a".into(), 1);
        lineage_counts.insert("lid-b".into(), 1);
        let spatial2 = SpatialIndex::build(&sim.organisms, 10);
        sim.tick_organism(0, 2, &lineage_counts, &spatial2);

        let wt = sim.organisms[0].wander_target;
        assert!(wt.is_some(),
            "in-range friend should set wander_target, got None");
        // Should be roughly where NearFriend is.
        if let Some((tx, ty)) = wt {
            assert!((tx - 70).abs() <= 5 && (ty - 70).abs() <= 5,
                "wander_target {:?} should point near (70,70)", wt);
        }
    }
}
