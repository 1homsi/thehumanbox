use super::config::{season_growth, DAY_LENGTH, SEASONS, SEASON_LENGTH};
use super::world_events::{
    push_event, tick_drought, tick_outbreak, tick_weather, tick_world_evolution, DroughtState, WeatherState,
};
use super::{courtship, growth, social};
use crate::organism::animal::{Animal, AnimalKind};
use crate::organism::attributes::check_earned_attributes;
use crate::organism::decision_bias::directive_aligns_action;
use crate::organism::organism::{Organism, DIRECTIONS};
use crate::physics::engine::PhysicsEngine;
use crate::world::{
    grid::{TrailKind, WorldGrid, HEIGHT, WIDTH},
    tiles::Tile,
};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

fn derive_mood(o: &Organism) -> String {
    if o.infection > 0.20 {
        "sick"
    } else if o.energy < 0.30 {
        "hungry"
    } else if o.hydration < 0.30 {
        "thirsty"
    } else if o.fear_level > 0.40 {
        "afraid"
    } else if o.grief_ticks > 0 {
        "mourning"
    } else if o.loneliness > 0.60 {
        "lonely"
    } else if o.is_elder {
        "weary"
    } else {
        "content"
    }
    .to_string()
}

fn fallback_walkable_step(
    grid: &WorldGrid,
    ix: i32,
    iy: i32,
    requested_action: usize,
    fear: f32,
    health: f32,
) -> Option<(i32, i32)> {
    let (rdx, rdy) = DIRECTIONS[requested_action];
    let mut best: Option<(i32, i32)> = None;
    let mut best_score = f32::NEG_INFINITY;
    for &(dx, dy) in &DIRECTIONS {
        let nx = ix + dx;
        let ny = iy + dy;
        let tile = grid.get(nx, ny);
        if !tile.walkable() {
            continue;
        }
        let alignment = (dx * rdx + dy * rdy) as f32;
        let mut score = alignment * 10.0;
        if tile == Tile::Water {
            let depth = grid.depth_at(nx, ny);
            if depth > 0.18 {
                score -= 40.0;
            } else {
                score -= 4.0 + depth * 8.0;
            }
        }
        let hazard = grid.hazard_at(nx, ny);
        if hazard > 0.0 {
            let cautiousness = 0.7 + fear * 0.8 + (1.0 - health).max(0.0) * 0.5;
            score -= hazard * 14.0 * cautiousness;
        }
        if score > best_score {
            best_score = score;
            best = Some((nx, ny));
        }
    }
    best
}

fn safe_flee_target(
    grid: &WorldGrid,
    ox: f32,
    oy: f32,
    away_dx: f32,
    away_dy: f32,
    flee_dist: f32,
) -> (i32, i32) {
    let raw_tx = ((ox + away_dx * flee_dist).round() as i32).clamp(5, WIDTH as i32 - 5);
    let raw_ty = ((oy + away_dy * flee_dist).round() as i32).clamp(5, HEIGHT as i32 - 5);
    let start = (ox as i32, oy as i32);
    let mut best = (raw_tx, raw_ty);
    let mut best_score = f32::NEG_INFINITY;

    for radius in [0i32, 4, 8, 14] {
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if radius > 0 && dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let tx = (raw_tx + dx).clamp(5, WIDTH as i32 - 5);
                let ty = (raw_ty + dy).clamp(5, HEIGHT as i32 - 5);
                let tile = grid.get(tx, ty);
                if !tile.walkable() {
                    continue;
                }
                let progress =
                    ((tx - start.0) as f32 * away_dx + (ty - start.1) as f32 * away_dy) / flee_dist.max(1.0);
                let mut score = progress * 10.0;
                score -= ((tx - raw_tx).abs() + (ty - raw_ty).abs()) as f32 * 0.12;
                if tile == Tile::Water {
                    score -= 5.0 + grid.depth_at(tx, ty) * 12.0;
                }
                score -= grid.hazard_at(tx, ty) * 18.0;
                if score > best_score {
                    best_score = score;
                    best = (tx, ty);
                }
            }
        }
        if best_score.is_finite()
            && grid.hazard_at(best.0, best.1) < 0.40
            && grid.get(best.0, best.1) != Tile::Water
        {
            break;
        }
    }

    best
}

fn movement_step_feedback(
    grid: &WorldGrid,
    ix: i32,
    iy: i32,
    requested_action: usize,
    destination: Option<(i32, i32)>,
) -> f32 {
    let (dx, dy) = DIRECTIONS[requested_action];
    let requested = (ix + dx, iy + dy);
    let requested_tile = grid.get(requested.0, requested.1);
    let Some((mx, my)) = destination else {
        return -0.018;
    };

    let mut feedback = 0.001;
    if !requested_tile.walkable() {
        feedback -= 0.006;
    }
    if (mx, my) != requested {
        feedback -= 0.002;
    }

    let moved_tile = grid.get(mx, my);
    if moved_tile == Tile::Water {
        let depth = grid.depth_at(mx, my);
        feedback -= 0.003 + depth * 0.012;
    }
    let hazard = grid.hazard_at(mx, my);
    if hazard > 0.0 {
        feedback -= hazard * 0.025;
    }

    feedback
}

fn movement_momentum_feedback(
    org: &Organism,
    grid: &WorldGrid,
    from: (i32, i32),
    destination: Option<(i32, i32)>,
) -> f32 {
    let Some((mx, my)) = destination else {
        return 0.0;
    };
    let step = ((mx - from.0) as f32, (my - from.1) as f32);
    let step_len = (step.0 * step.0 + step.1 * step.1).sqrt();
    let prior_len = (org.vx_smooth * org.vx_smooth + org.vy_smooth * org.vy_smooth).sqrt();
    if step_len < 0.5 || prior_len < 0.15 {
        return 0.0;
    }

    let dot = (step.0 * org.vx_smooth + step.1 * org.vy_smooth) / (step_len * prior_len);
    if dot >= -0.55 {
        return 0.0;
    }

    let urgent = org.energy < 0.32 || org.hydration < 0.32 || org.health < 0.45;
    let escaping_danger = org.fear_level > 0.55
        || grid.hazard_at(from.0, from.1) > 0.35
        || grid.hazard_at(mx, my) + 0.10 < grid.hazard_at(from.0, from.1);
    if urgent || escaping_danger {
        return 0.0;
    }

    -0.006 * (1.0 - org.traits.curiosity * 0.35).clamp(0.65, 1.0)
}

fn urgent_resource_progress_feedback(
    org: &Organism,
    from: (i32, i32),
    destination: Option<(i32, i32)>,
) -> f32 {
    let Some(to) = destination else {
        let hunger_urgency = (0.50 - org.energy).max(0.0) / 0.50;
        let thirst_urgency = (0.50 - org.hydration).max(0.0) / 0.50;
        return -0.004 * hunger_urgency.max(thirst_urgency).min(1.0);
    };

    let mut feedback = 0.0f32;
    let mut score_target = |target: Option<(i32, i32)>, urgency: f32| {
        let Some((tx, ty)) = target else {
            return;
        };
        let urgency = urgency.clamp(0.0, 1.0);
        if urgency <= 0.0 {
            return;
        }
        let before = (tx - from.0).abs() + (ty - from.1).abs();
        let after = (tx - to.0).abs() + (ty - to.1).abs();
        if before == 0 {
            return;
        }
        let delta = before - after;
        if delta > 0 {
            feedback += (delta as f32 / before as f32).min(0.25) * 0.018 * urgency;
        } else if delta < 0 {
            feedback -= ((-delta) as f32 / before as f32).min(0.25) * 0.012 * urgency;
        }
    };

    let hunger_urgency = (0.50 - org.energy) / 0.50;
    if hunger_urgency > 0.0 {
        let target = Organism::best_remembered_with_danger(
            &org.food_memory,
            from.0 as f32,
            from.1 as f32,
            &org.danger_memory,
            hunger_urgency,
        );
        score_target(target, hunger_urgency);
    }

    let thirst_urgency = (0.50 - org.hydration) / 0.50;
    if thirst_urgency > 0.0 {
        let target = Organism::best_remembered_with_danger(
            &org.water_memory,
            from.0 as f32,
            from.1 as f32,
            &org.danger_memory,
            thirst_urgency,
        );
        score_target(target, thirst_urgency);
    }

    feedback
}

fn reserve_inventory_feedback(
    prev_energy: f32,
    prev_hydration: f32,
    prev_food: u8,
    prev_water: u8,
    org: &Organism,
) -> f32 {
    let food_gain = org.inv_food.saturating_sub(prev_food) as f32;
    let water_gain = org.inv_water.saturating_sub(prev_water) as f32;
    let mut feedback = 0.0f32;

    if food_gain > 0.0 && prev_food < 3 {
        let future_hunger = ((0.80 - prev_energy) / 0.80).clamp(0.15, 1.0);
        let room_factor = (3 - prev_food).min(food_gain as u8) as f32;
        feedback += 0.006 * future_hunger * room_factor;
    }

    if water_gain > 0.0 && prev_water < 4 {
        let future_thirst = ((0.85 - prev_hydration) / 0.85).clamp(0.15, 1.0);
        let room_factor = (4 - prev_water).min(water_gain as u8) as f32;
        feedback += 0.005 * future_thirst * room_factor;
    }

    feedback
}

fn use_needed_reserves(org: &mut Organism, tick: u64) -> (bool, bool) {
    let urgent_water = org.hydration < 0.24;
    let periodic_water = org.hydration < 0.55 && tick.is_multiple_of(8);
    let used_water = if org.inv_water > 0 && (urgent_water || periodic_water) {
        org.inv_water -= 1;
        org.hydration = (org.hydration + 0.18).min(1.0);
        true
    } else {
        false
    };

    let urgent_food = org.energy < 0.28;
    let periodic_food = org.energy < 0.45 && tick.is_multiple_of(6);
    let used_food = if org.inv_food > 0 && (urgent_food || periodic_food) {
        org.inv_food -= 1;
        org.energy = (org.energy + 0.30).min(1.0);
        true
    } else {
        false
    };

    (used_food, used_water)
}

fn resource_near(grid: &WorldGrid, x: i32, y: i32, tile: Tile) -> bool {
    (-1i32..=1).any(|dx| (-1i32..=1).any(|dy| grid.get(x + dx, y + dy) == tile))
}

fn decay_local_resource_memory(
    memory: &mut FxHashMap<(i32, i32), f32>,
    x: i32,
    y: i32,
    exact_factor: f32,
    nearby_factor: f32,
) {
    for dx in -1i32..=1 {
        for dy in -1i32..=1 {
            let key = (x + dx, y + dy);
            if let Some(v) = memory.get_mut(&key) {
                *v *= if dx == 0 && dy == 0 {
                    exact_factor
                } else {
                    nearby_factor
                };
            }
        }
    }
    memory.retain(|_, v| *v >= 0.04);
}

fn verify_local_resource_memory(org: &mut Organism, grid: &WorldGrid, x: i32, y: i32) {
    let tile = grid.get(x, y);
    if tile == Tile::Water {
        let ms = org.traits.memory_strength;
        Organism::remember(&mut org.water_memory, x, y, 0.2, ms);
    } else if !resource_near(grid, x, y, Tile::Water) {
        decay_local_resource_memory(&mut org.water_memory, x, y, 0.45, 0.70);
    }

    if tile == Tile::Food {
        let ms = org.traits.memory_strength;
        Organism::remember(&mut org.food_memory, x, y, 0.2, ms);
    } else if !resource_near(grid, x, y, Tile::Food) {
        decay_local_resource_memory(&mut org.food_memory, x, y, 0.45, 0.70);
    }
}

fn local_danger_present(grid: &WorldGrid, animals: &[Animal], x: i32, y: i32) -> bool {
    let terrain_danger = (-1i32..=1).any(|dx| {
        (-1i32..=1).any(|dy| {
            let nx = x + dx;
            let ny = y + dy;
            matches!(grid.get(nx, ny), Tile::Fire) || grid.hazard_at(nx, ny) >= 0.35
        })
    });
    if terrain_danger {
        return true;
    }

    animals
        .iter()
        .any(|a| a.alive && a.kind.predator() && (a.x - x as f32).abs() + (a.y - y as f32).abs() <= 5.0)
}

fn verify_local_danger_memory(org: &mut Organism, grid: &WorldGrid, animals: &[Animal], x: i32, y: i32) {
    if local_danger_present(grid, animals, x, y) {
        let current_hazard = grid.hazard_at(x, y);
        if current_hazard >= 0.35 || matches!(grid.get(x, y), Tile::Fire) {
            let ms = org.traits.memory_strength;
            Organism::remember(&mut org.danger_memory, x, y, 0.20 + current_hazard * 0.40, ms);
        }
        return;
    }

    decay_local_resource_memory(&mut org.danger_memory, x, y, 0.50, 0.72);
}
use super::spatial::SpatialIndex;

pub const SAVE_SCHEMA_VERSION: u32 = 3;

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StoryEntry {
    pub tick: u64,
    pub org_name: String,
    pub lineage_id: String,
    pub story: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ThinkTrigger {
    pub org_id: String,
    pub org_name: String,
    pub lineage_id: String,
    pub scenario: String,
    pub target_lineage: Option<String>,
    pub kin_count: usize,
    pub energy_avg: f32,
    pub context: String,
    pub discoveries: Vec<String>,
    pub life_log_top: Vec<String>,
    pub emotional_state: String,
    pub other_name: Option<String>,
    pub other_discoveries: Vec<String>,
    pub target_org_id: Option<String>,
    pub aggression: f32,
    pub fear: f32,
    pub social_tendency: f32,
    pub curiosity: f32,
    pub resilience: f32,
    pub world_era: String,
    pub season: String,
}

impl Default for ThinkTrigger {
    fn default() -> Self {
        ThinkTrigger {
            org_id: String::new(),
            org_name: String::new(),
            lineage_id: String::new(),
            scenario: String::new(),
            target_lineage: None,
            kin_count: 0,
            energy_avg: 0.5,
            context: String::new(),
            discoveries: Vec::new(),
            life_log_top: Vec::new(),
            emotional_state: String::new(),
            other_name: None,
            other_discoveries: Vec::new(),
            target_org_id: None,
            aggression: 0.5,
            fear: 0.5,
            social_tendency: 0.5,
            curiosity: 0.5,
            resilience: 0.5,
            world_era: String::new(),
            season: String::new(),
        }
    }
}

impl ThinkTrigger {
    pub fn with_traits(mut self, org: &Organism) -> Self {
        self.aggression = org.traits.aggression;
        self.fear = org.traits.fear;
        self.social_tendency = org.traits.social_tendency;
        self.curiosity = org.traits.curiosity;
        self.resilience = org.traits.resilience;
        self
    }
}

pub struct PendingMemoryFlush {
    pub org_id: String,
    pub org_name: String,
    pub lineage_id: String,
    pub flushed_tick: u64,
    pub memories: Vec<crate::organism::memory::MemoryEntry>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Event {
    pub tick: u64,
    #[serde(rename = "type")]
    pub etype: String,
    pub actor: String,
    pub detail: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct History {
    pub births: u64,
    pub deaths_old_age: u64,
    pub deaths_starvation: u64,
    pub deaths_dehydration: u64,
    pub deaths_sickness: u64,
    pub deaths_combat: u64,
    pub sickness_events: u64,
    pub alliances_formed: u64,
    pub challenges_total: u64,
    pub gifts_total: u64,
    pub droughts: u64,
    pub outbreaks: u64,
    #[serde(default)]
    pub era_history: VecDeque<EraEntry>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct EraEntry {
    pub tick: u64,
    pub era: String,
}

pub struct Simulation {
    pub grid: WorldGrid,
    pub physics: PhysicsEngine,
    pub organisms: Vec<Organism>,
    pub animals: Vec<Animal>,
    pub tick_count: u64,
    pub events: VecDeque<Event>,
    pub history: History,
    pub drought: DroughtState,
    pub weather: WeatherState,
    pub flood_tiles: Vec<(i32, i32, u64)>,
    pub story_history: VecDeque<StoryEntry>,
    pub pending_thinks: Vec<ThinkTrigger>,
    pub pending_convos: Vec<crate::sim::convo_req::ConversationReq>,
    pub pending_memory_flushes: Vec<PendingMemoryFlush>,
    pub lineage_names: HashMap<String, String>,
    pub lineage_strategies: HashMap<String, (String, u64)>,
    pub(crate) lineage_last_council: HashMap<String, u64>,
    pub(crate) lineage_elders: HashMap<String, String>,
    pub(crate) lineage_negotiations: HashMap<(String, String), u64>,
    pub pop_history: VecDeque<[u64; 2]>,
    pub lineage_centroid_history: HashMap<String, VecDeque<[i32; 3]>>,
    /// Ancestral home per lineage - stamped the first time the
    /// lineage shows up in tick_lineage_centroids and never overwritten.
    /// Lets the client render an "where this lineage came from"
    /// overlay even after living members have wandered far away.
    /// Format: [home_x, home_y, radius_tiles]. Radius is fixed at 30
    /// tiles today; future work can derive it from the historical
    /// spread of centroids.
    pub lineage_homes: HashMap<String, [i32; 3]>,
    pub lineage_eras: HashMap<String, super::era::Era>,
    pub buildings: Vec<super::buildings::Building>,
    pub next_building_id: u32,
    pub governments: HashMap<String, super::government::Government>,
    pub religions: Vec<super::culture::Religion>,
    pub next_religion_id: u32,
    pub artworks: Vec<super::culture::Artwork>,
    pub next_artwork_id: u32,
    pub festivals: Vec<super::culture::Festival>,
    pub next_festival_id: u32,
    pub action_counts: HashMap<&'static str, u64>,
    pub decision_counts: HashMap<&'static str, u64>,
    pub workshop_hits: HashMap<&'static str, (u64, u64)>,
    pub last_witness_tick: u64,
    pub books: Vec<super::language_tech::Book>,
    pub next_book_id: u32,
    pub farms: Vec<super::agriculture::Farm>,
    pub next_farm_id: u32,
    pub vehicles: Vec<super::transportation::Vehicle>,
    pub next_vehicle_id: u32,
    pub battles: Vec<super::warfare::Battle>,
    pub next_battle_id: u32,
    pub treaties: Vec<super::warfare::Treaty>,
    pub outbreaks: Vec<super::medicine::Outbreak>,
    pub milestones_achieved: HashSet<String>,
    pub headlines: VecDeque<(u64, String)>,
    pub trades: VecDeque<super::civ::economy::Trade>,
    pub water_use: HashMap<(i32, i32), u32>,
    pub current_era: String,
    pub sex_words: [String; 2],
    pub world_seed: u64,
    pub(crate) next_animal_id: usize,
    pub(crate) rng: ChaCha8Rng,
    pub last_immigration_tick: u64,
    pub(crate) cached_tribal_relations: serde_json::Value,
    pub(crate) cached_lineage_sizes: serde_json::Value,
    pub(crate) slow_compute_tick: u64,
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
    if has("fire") && has("wood") && !has("cooking") {
        v.push("cooking");
    }
    if has("fire") && has("stone") && !has("stone_tools") {
        v.push("stone_tools");
    }
    if has("shelter") && has("stone") && !has("masonry") {
        v.push("masonry");
    }
    if has("stone") && has("hunt") && !has("spear") {
        v.push("spear");
    }
    if has("fire") && has("shelter") && !has("torch") {
        v.push("torch");
    }
    if has("fire") && has("cooking") && !has("medicine") {
        v.push("medicine");
    }
    if has("wood") && has("hunt") && !has("trap") {
        v.push("trap");
    }
    if has("fire") && has("shelter") && !has("ritual") {
        v.push("ritual");
    }
    if has("wood") && !has("basket") {
        v.push("basket");
    }
    if has("masonry") && has("water") && !has("irrigation") {
        v.push("irrigation");
    }
    v
}

fn scarcity_driven_migration_season(season: &str) -> bool {
    matches!(season, "scarcity" | "decline")
}

impl Simulation {
    pub fn new(seed: u64) -> Self {
        let rng = ChaCha8Rng::seed_from_u64(seed);
        let grid = WorldGrid::new(seed);
        let physics = PhysicsEngine::new();

        let sex_words = {
            use crate::organism::vocabulary::gen_phoneme_word;
            use rand::SeedableRng;
            let mut word_rng = rand::rngs::SmallRng::seed_from_u64(seed.wrapping_add(0xc0ffee));
            let w0 = gen_phoneme_word(&mut word_rng);
            let mut w1 = gen_phoneme_word(&mut word_rng);
            while w1 == w0 {
                w1 = gen_phoneme_word(&mut word_rng);
            }
            [w0, w1]
        };

        let mut sim = Simulation {
            grid,
            physics,
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
            pending_memory_flushes: Vec::new(),
            lineage_names: HashMap::new(),
            lineage_strategies: HashMap::new(),
            lineage_last_council: HashMap::new(),
            lineage_elders: HashMap::new(),
            lineage_negotiations: HashMap::new(),
            pop_history: VecDeque::new(),
            lineage_centroid_history: HashMap::new(),
            lineage_homes: HashMap::new(),
            lineage_eras: HashMap::new(),
            buildings: Vec::new(),
            next_building_id: 1,
            governments: HashMap::new(),
            religions: Vec::new(),
            next_religion_id: 1,
            artworks: Vec::new(),
            next_artwork_id: 1,
            festivals: Vec::new(),
            next_festival_id: 1,
            action_counts: HashMap::new(),
            decision_counts: HashMap::new(),
            workshop_hits: HashMap::new(),
            last_witness_tick: 0,
            books: Vec::new(),
            next_book_id: 1,
            farms: Vec::new(),
            next_farm_id: 1,
            vehicles: Vec::new(),
            next_vehicle_id: 1,
            battles: Vec::new(),
            next_battle_id: 1,
            treaties: Vec::new(),
            outbreaks: Vec::new(),
            milestones_achieved: HashSet::new(),
            headlines: VecDeque::new(),
            trades: VecDeque::new(),
            water_use: HashMap::new(),
            current_era: "genesis".to_string(),
            sex_words,
            world_seed: seed,
            next_animal_id: 0,
            rng,
            last_immigration_tick: 0,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes: serde_json::Value::Array(vec![]),
            slow_compute_tick: 0,
            active_structure_tiles: HashSet::new(),
            settlement_tiers: HashMap::new(),
            territory: HashMap::new(),
            tile_owner: HashMap::new(),
            cached_territory: serde_json::Value::Null,
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
        if trigger.world_era.is_empty() {
            trigger.world_era = self.current_era.clone();
        }
        if trigger.season.is_empty() {
            trigger.season = self.season().to_string();
        }
        if self.pending_thinks.len() >= 128 {
            self.pending_thinks.remove(0);
        }
        self.pending_thinks.push(trigger);
    }

    pub fn apply_memory_pressure(&mut self, pressure: super::memory_pressure::MemoryPressure) {
        use super::memory_pressure::MemoryPressure;
        match pressure {
            MemoryPressure::Normal => (),
            MemoryPressure::Elevated => {
                self.organisms
                    .retain(|o| o.alive || self.tick_count.saturating_sub(o.last_story_tick) < 30_000);
                let mut dead_kept = 0usize;
                self.organisms.retain(|o| {
                    if o.alive {
                        return true;
                    }
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
                    while o.life_log.len() > 24 {
                        o.life_log.pop_front();
                    }
                    while o.thought_history.len() > 16 {
                        o.thought_history.pop_front();
                    }
                    while o.conversations.len() > 12 {
                        o.conversations.pop_front();
                    }
                    o.food_memory.retain(|_, v| *v > 0.20);
                    o.water_memory.retain(|_, v| *v > 0.20);
                    o.danger_memory.retain(|_, v| *v > 0.20);
                }
                while self.events.len() > 80 {
                    self.events.pop_front();
                }
                while self.story_history.len() > 80 {
                    self.story_history.pop_front();
                }
                while self.pop_history.len() > 300 {
                    self.pop_history.pop_front();
                }
                while self.history.era_history.len() > 24 {
                    self.history.era_history.pop_front();
                }
                let alive_lineages: std::collections::HashSet<String> = self
                    .organisms
                    .iter()
                    .filter(|o| o.alive)
                    .map(|o| o.lineage_id.clone())
                    .collect();
                self.lineage_names.retain(|k, _| alive_lineages.contains(k));
                self.lineage_strategies.retain(|k, _| alive_lineages.contains(k));
                self.lineage_centroid_history
                    .retain(|k, _| alive_lineages.contains(k));
                self.lineage_last_council
                    .retain(|k, _| alive_lineages.contains(k));
                self.lineage_elders.retain(|k, _| alive_lineages.contains(k));
                self.lineage_negotiations
                    .retain(|(a, b), _| alive_lineages.contains(a) && alive_lineages.contains(b));
            }
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;

        super::civ_tick::tick_civ(self);

        if self.tick_count.is_multiple_of(6000) {
            let alive = self.organisms.iter().filter(|o| o.alive).count();
            let q_rows: usize = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.q_table.len())
                .sum();
            let food: usize = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.food_memory.len())
                .sum();
            let trust: usize = self
                .organisms
                .iter()
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

        if self.tick_count.is_multiple_of(5) {
            let wet = self.weather.is_wet(self.tick_count);
            self.physics
                .tick(&mut self.grid, &mut self.rng, self.weather.kind, wet);
        }

        let _phase = self.tick_count % DAY_LENGTH;

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

        if self.tick_count.is_multiple_of(300) {
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

        if self.tick_count.is_multiple_of(500) {
            self.grid.decay_world_layers();
        }

        if self.tick_count.is_multiple_of(1200) {
            let new_era = self.compute_era();
            if new_era != self.current_era {
                self.history.era_history.push_back(EraEntry {
                    tick: self.tick_count,
                    era: new_era.clone(),
                });
                if self.history.era_history.len() > 60 {
                    self.history.era_history.pop_front();
                }
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "era",
                    "world",
                    &format!("the {} era begins", new_era),
                );
                self.current_era = new_era;
            }
        }

        if self.tick_count % 1200 == 600 {
            self.tick_settlements();
        }

        if self.tick_count.is_multiple_of(600) {
            super::tech_progress::seed_baseline_discoveries(&mut self.organisms, self.tick_count);
            self.update_lineage_eras();
            self.tick_water_depletion();
        }

        super::tech_progress::tick_tech_progress(
            self.tick_count,
            &mut self.rng,
            &mut self.organisms,
            &mut self.events,
            &self.lineage_names,
        );

        {
            let new_battles = super::warfare::try_spawn_raids(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
            );
            self.battles.extend(new_battles);
            let new_wars = super::warfare::try_spawn_border_wars(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
            );
            self.battles.extend(new_wars);
            super::warfare::tick_battles(
                self.tick_count,
                &mut self.rng,
                &mut self.battles,
                &mut self.treaties,
                &mut self.organisms,
                &self.active_structure_tiles,
                &mut self.events,
                &mut self.history.deaths_combat,
                &self.lineage_eras,
            );
        }

        growth::deliver_births(
            &mut self.organisms,
            self.tick_count,
            &mut self.events,
            &mut self.history,
        );

        if self.tick_count.is_multiple_of(DAY_LENGTH) {
            let alive = self.organisms.iter().filter(|o| o.alive).count() as u64;
            self.pop_history.push_back([self.tick_count, alive]);
            if self.pop_history.len() > 1000 {
                self.pop_history.pop_front();
            }
            self.sample_lineage_centroids();
        }

        if self.tick_count.is_multiple_of(60) && !self.lineage_centroid_history.is_empty() {
            self.tick_ancestral_recognition();
        }

        if self.tick_count.is_multiple_of(200) {
            let mut candidates: HashMap<String, (String, u32)> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                let e = candidates
                    .entry(org.lineage_id.clone())
                    .or_insert_with(|| (org.id.clone(), 0));
                if org.age > e.1 {
                    *e = (org.id.clone(), org.age);
                }
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

        const QX: i32 = 3;
        const QY: i32 = 3;
        let qw = WIDTH as f32 / QX as f32;
        let qh = HEIGHT as f32 / QY as f32;
        let mut quadrant_counts = [[0u32; QX as usize]; QY as usize];
        let mut alive_count_before_loop: usize = 0;
        let mut lineage_counts: FxHashMap<String, usize> =
            FxHashMap::with_capacity_and_hasher(self.lineage_names.len().max(8), Default::default());
        for o in self.organisms.iter() {
            if !o.alive {
                continue;
            }
            alive_count_before_loop += 1;
            *lineage_counts.entry(o.lineage_id.clone()).or_insert(0) += 1;
            let cx = ((o.x / qw).floor() as i32).clamp(0, QX - 1);
            let cy = ((o.y / qh).floor() as i32).clamp(0, QY - 1);
            quadrant_counts[cy as usize][cx as usize] += 1;
        }
        let sparse_quadrants = quadrant_counts.iter().flatten().filter(|&&n| n <= 6).count();
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
        let mut spatial_buf: Vec<usize> = Vec::with_capacity(32);
        let mut org_idx_by_id: FxHashMap<String, usize> =
            FxHashMap::with_capacity_and_hasher(self.organisms.len(), Default::default());
        for (i, o) in self.organisms.iter().enumerate() {
            if o.alive {
                org_idx_by_id.insert(o.id.clone(), i);
            }
        }
        for i in 0..self.organisms.len() {
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                self.tick_organism(
                    i,
                    alive_count_before_loop,
                    &lineage_counts,
                    &spatial,
                    &mut spatial_buf,
                    &org_idx_by_id,
                );

                if self.organisms.len() > prev_len {
                    let child_idx = self.organisms.len() - 1;
                    let child_lid = self.organisms[child_idx].lineage_id.clone();
                    if let Some(elder_id) = self.lineage_elders.get(&child_lid).cloned() {
                        let epos_opt = org_idx_by_id.get(&elder_id).copied();
                        if let Some(epos) = epos_opt {
                            if epos != child_idx {
                                let danger: Vec<_> = self.organisms[epos]
                                    .danger_memory
                                    .iter()
                                    .map(|(&k, &v)| (k, v))
                                    .collect();
                                let food: Vec<_> = self.organisms[epos]
                                    .food_memory
                                    .iter()
                                    .map(|(&k, &v)| (k, v))
                                    .collect();
                                let child = &mut self.organisms[child_idx];
                                let ms = child.traits.memory_strength;
                                for (k, v) in danger {
                                    if self.rng.random::<f32>() < 0.45 {
                                        Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.4, ms);
                                    }
                                }
                                for (k, v) in food {
                                    if self.rng.random::<f32>() < 0.20 {
                                        Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.2, ms);
                                    }
                                }

                                if !self.organisms[epos].life_log.is_empty() {
                                    let elder_name = self.organisms[epos].name.clone();
                                    let elder_id = self.organisms[epos].id.clone();
                                    let life_top: Vec<String> = self.organisms[epos]
                                        .life_log
                                        .iter()
                                        .take(4)
                                        .map(|e| e.text.clone())
                                        .collect();
                                    let child_name = self.organisms[child_idx].name.clone();
                                    let child_id = self.organisms[child_idx].id.clone();
                                    let lid = self.organisms[child_idx].lineage_id.clone();
                                    self.push_think_for(
                                        epos,
                                        ThinkTrigger {
                                            org_id: elder_id,
                                            org_name: elder_name,
                                            lineage_id: lid,
                                            scenario: "elder_teaching".to_string(),
                                            other_name: Some(child_name),
                                            target_org_id: Some(child_id),
                                            life_log_top: life_top,
                                            ..Default::default()
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        const VEL_EMA_ALPHA: f32 = 0.4;
        const MAX_PER_TICK: f32 = 2.0;
        for o in self.organisms.iter_mut() {
            if !o.alive {
                continue;
            }
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

        if self.tick_count.is_multiple_of(1200) {
            let dead_count = self.organisms.iter().filter(|o| !o.alive).count();
            const RECENT_DEAD_FULL: usize = 300;
            const MAX_ARCHIVE: usize = 800;
            if dead_count > RECENT_DEAD_FULL {
                let to_compress = dead_count - RECENT_DEAD_FULL;
                let mut compressed = 0usize;
                let tick_now = self.tick_count;
                for o in self.organisms.iter_mut() {
                    if compressed >= to_compress {
                        break;
                    }
                    if !o.alive && !o.q_table.is_empty() {
                        if !o.memories.is_empty() {
                            let top: Vec<crate::organism::memory::MemoryEntry> =
                                o.memories.top(8).into_iter().cloned().collect();
                            self.pending_memory_flushes.push(PendingMemoryFlush {
                                org_id: o.id.clone(),
                                org_name: o.name.clone(),
                                lineage_id: o.lineage_id.clone(),
                                flushed_tick: tick_now,
                                memories: top,
                            });
                        }
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
                    if o.alive {
                        return true;
                    }
                    if removed < excess {
                        removed += 1;
                        return false;
                    }
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
            let mut demote = Vec::new();
            let mut to_remove = Vec::new();
            for &(x, y) in &self.active_structure_tiles {
                let s = self.grid.structure_at(x, y);
                if s <= 0.0 {
                    to_remove.push((x, y));
                    continue;
                }
                let ns = (s - decay).max(0.0);
                *self.grid.structure_at_mut(x, y) = ns;
                if ns == 0.0 {
                    to_remove.push((x, y));
                }
                let tile = self.grid.get(x, y);
                if ns >= 0.85
                    && matches!(
                        tile,
                        Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Food
                    )
                {
                    promote.push((x, y));
                } else if ns < 0.1 && tile == Tile::Hut {
                    demote.push((x, y));
                }
            }
            for (x, y) in to_remove {
                self.active_structure_tiles.remove(&(x, y));
            }
            for (x, y) in promote {
                self.grid.set(x, y, Tile::Hut);
            }
            for (x, y) in demote {
                self.grid.set(x, y, Tile::Ash);
            }
        }
    }

    fn tick_organism(
        &mut self,
        idx: usize,
        alive_count: usize,
        lineage_counts: &FxHashMap<String, usize>,
        spatial: &SpatialIndex,
        spatial_buf: &mut Vec<usize>,
        org_idx_by_id: &FxHashMap<String, usize>,
    ) {
        let night = self.is_night();
        let epsilon = (0.30 - self.organisms[idx].age as f32 * 0.00005).max(0.08);

        let prev_energy = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;
        let prev_inv_food = self.organisms[idx].inv_food;
        let prev_inv_water = self.organisms[idx].inv_water;

        {
            let org = &self.organisms[idx];
            let ox = org.x as i32;
            let oy = org.y as i32;
            spatial.query_into(ox, oy, 6, spatial_buf);
            let mut kin_near: usize = 0;
            let mut hostile_near = false;
            for &i in spatial_buf.iter() {
                if i == idx {
                    continue;
                }
                let o = &self.organisms[i];
                if !o.alive {
                    continue;
                }
                let dist = (o.x - org.x).abs() + (o.y - org.y).abs();
                if o.lineage_id == org.lineage_id {
                    if dist <= 5.0 {
                        kin_near += 1;
                    }
                } else if !hostile_near && dist <= 6.0 && org.attitude_toward(&o.lineage_id) < -0.2 {
                    hostile_near = true;
                }
            }
            let near_shelter = (-2i32..=2).any(|dx| {
                (-2i32..=2).any(|dy| {
                    let nx = ox + dx;
                    let ny = oy + dy;
                    matches!(self.grid.get(nx, ny), Tile::Hut | Tile::Rock)
                        || self.grid.structure_at(nx, ny) >= 0.35
                })
            });
            let weather_kind = self.weather.kind;
            let tick_now = self.tick_count;
            self.organisms[idx].tick_inner_state(
                kin_near,
                near_shelter,
                hostile_near,
                weather_kind,
                tick_now,
                night,
            );
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let intruders: Vec<String> = if let Some(elder_id) = self.lineage_elders.get(&my_lid) {
                if let Some(&elder_idx) = org_idx_by_id.get(elder_id) {
                    let elder = &self.organisms[elder_idx];
                    let (ex, ey) = (elder.home_x, elder.home_y);
                    let org = &self.organisms[idx];
                    if (org.x - ex).abs() + (org.y - ey).abs() < 20.0 {
                        let mut v: Vec<String> = Vec::new();
                        for o in self.organisms.iter() {
                            if !o.alive || o.lineage_id == my_lid {
                                continue;
                            }
                            if (o.x - ex).abs() + (o.y - ey).abs() < 12.0 {
                                v.push(o.lineage_id.clone());
                            }
                        }
                        v
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };
            for intruder_lid in intruders {
                let att = self.organisms[idx]
                    .lineage_attitudes
                    .entry(intruder_lid)
                    .or_insert(0.0);
                *att = (*att - 0.0015).max(-1.0);
            }
        }

        // Passive territory: organisms gradually stamp their lineage onto land they inhabit.
        // Those with borders/territory discovery claim a wider radius around home.
        if self.tick_count % 40 == (idx as u64 % 40) {
            let has_borders = self.organisms[idx].discoveries.contains("territory")
                || self.organisms[idx].discoveries.contains("borders");
            let (hx, hy) = (
                self.organisms[idx].home_x as i32,
                self.organisms[idx].home_y as i32,
            );
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
            let rival_lid: Option<String> = self
                .tile_owner
                .get(&(ox_i, oy_i))
                .filter(|lid| lid.as_str() != self.organisms[idx].lineage_id)
                .cloned();
            if let Some(rival) = rival_lid {
                let att = self.organisms[idx].lineage_attitudes.entry(rival).or_insert(0.0);
                *att = (*att - 0.002).max(-1.0);
            }
        }

        let animal_near = {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            self.animals
                .iter()
                .any(|a| a.alive && (a.x - ox).abs() + (a.y - oy).abs() <= 8.0)
        };
        let perception =
            self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near, spatial);
        self.validate_or_assign_wander_target(idx);

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let fear_trait = self.organisms[idx].traits.fear;

        // Wolf pressure is remembered as context. Only collision-range danger
        // stays reflexive; otherwise the learned chooser decides what to do.
        let wolf_flee_radius = 6.0 + fear_trait * 8.0;
        let wolf_threat = self
            .animals
            .iter()
            .filter(|a| a.alive && matches!(a.kind, AnimalKind::Wolf))
            .map(|a| ((a.x - ox).abs() + (a.y - oy).abs(), a.x, a.y))
            .filter(|&(d, _, _)| d <= wolf_flee_radius)
            .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        if let Some((_, wx, wy)) = wolf_threat {
            let wx_i = wx as i32;
            let wy_i = wy as i32;
            let prev = self.organisms[idx]
                .danger_memory
                .get(&(wx_i, wy_i))
                .copied()
                .unwrap_or(0.0);
            self.organisms[idx]
                .danger_memory
                .insert((wx_i, wy_i), (prev + 0.4).min(1.0));
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.05).min(1.0);
        }

        // Need-driven construction: during storms, organisms with wood and no nearby shelter
        // urgently build wherever they're standing if the tile allows it.
        let storm_build: Option<(usize, Option<String>)> =
            if self.weather.kind >= 2 && self.organisms[idx].inv_wood >= 1 {
                let (bx, by) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
                let shelter_nearby = (-3i32..=3).any(|dx| {
                    (-3i32..=3).any(|dy| matches!(self.grid.get(bx + dx, by + dy), Tile::Hut | Tile::Rock))
                });
                if !shelter_nearby {
                    let tile = self.grid.get(bx, by);
                    if matches!(tile, Tile::Grass | Tile::Sand | Tile::Snow) {
                        Some((49, Some("must build shelter now!".to_string())))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

        let (action, new_thought, decision_origin): (usize, Option<String>, &'static str) =
            if let Some((action, thought)) = storm_build {
                (action, thought, "emergency_reflex")
            } else if let Some((dist, wx, wy)) = wolf_threat.filter(|(dist, _, _)| *dist <= 2.5) {
                let fdx = (ox - wx).signum();
                let fdy = (oy - wy).signum();
                let dir = match (fdx as i32, fdy as i32) {
                    (0, -1) => 0,
                    (0, 1) => 1,
                    (-1, 0) => 2,
                    (1, 0) => 3,
                    (-1, -1) => 4,
                    (1, -1) => 5,
                    (-1, 1) => 6,
                    (1, 1) => 7,
                    _ => 0,
                };
                // Set a distant flee target so they keep running after the wolf leaves range
                let flee_dist = 20.0 + fear_trait * 30.0;
                let (tx, ty) = safe_flee_target(&self.grid, ox, oy, fdx, fdy, flee_dist);
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level + 0.07 + (2.5 - dist) * 0.02).min(1.0);
                (dir, Some("wolf! run!".to_string()), "emergency_reflex")
            } else {
                let (oa_ix, oa_iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
                let avail = crate::sim::actions::available_actions(self, idx, oa_ix, oa_iy, spatial);
                let q_seen = self.organisms[idx].q_table.contains_key(&perception);
                let active_directive = if self.tick_count < self.organisms[idx].directive_until
                    && !self.organisms[idx].directive.is_empty()
                {
                    Some(self.organisms[idx].directive.clone())
                } else {
                    None
                };
                let active_wander_action = self.organisms[idx]
                    .wander_target
                    .map(|target| self.organisms[idx].toward(target, &self.grid));
                let chosen = self.organisms[idx].choose_action(
                    &self.grid,
                    self.tick_count,
                    epsilon,
                    &self.organisms,
                    night,
                    self.weather.kind,
                    &mut self.rng,
                    animal_near,
                    &perception,
                    &avail,
                );
                let decision_origin = if active_wander_action == Some(chosen.0) {
                    "soft_wander"
                } else if active_directive
                    .as_deref()
                    .is_some_and(|directive| directive_aligns_action(directive, chosen.0))
                {
                    "soft_directive"
                } else if q_seen {
                    "learned_q"
                } else {
                    "seed_or_explore"
                };
                (chosen.0, chosen.1, decision_origin)
            };
        *self.decision_counts.entry(decision_origin).or_insert(0) += 1;
        if let Some(t) = new_thought {
            self.organisms[idx].think(&t, self.tick_count);
        }

        let (ix, iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);

        let mut signal_reward = 0.0f32;
        let mut movement_reward = 0.0f32;

        if action < 8 {
            let (dx, dy) = DIRECTIONS[action];
            let (nx, ny) = (ix + dx, iy + dy);
            let next_tile = self.grid.get(nx, ny);
            let destination = if next_tile.walkable() {
                Some((nx, ny))
            } else {
                fallback_walkable_step(
                    &self.grid,
                    ix,
                    iy,
                    action,
                    self.organisms[idx].traits.fear,
                    self.organisms[idx].health,
                )
            };
            movement_reward = movement_step_feedback(&self.grid, ix, iy, action, destination);
            movement_reward +=
                movement_momentum_feedback(&self.organisms[idx], &self.grid, (ix, iy), destination);
            movement_reward += urgent_resource_progress_feedback(&self.organisms[idx], (ix, iy), destination);
            if let Some((mx, my)) = destination {
                self.organisms[idx].x = mx as f32;
                self.organisms[idx].y = my as f32;
                self.grid.leave_trail(mx, my, TrailKind::Path, 0.06);
                self.grid.stamp_pressure(mx, my);
                let has_farming = self.organisms[idx].discoveries.contains("farm");
                if has_farming {
                    let fidx = WorldGrid::idx(mx, my);
                    if self.grid.fertility[fidx] < 0.25 {
                        self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.004).min(0.55);
                    }
                }
            }
        } else if action == 8 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Food {
                let cooking_bonus = if self.organisms[idx].discoveries.contains("cooking") {
                    let near_fire = [(-1, 0), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                        matches!(self.grid.get(cx + dx, cy + dy), Tile::Campfire | Tile::Fire)
                    });
                    if near_fire {
                        0.12
                    } else {
                        0.0
                    }
                } else {
                    0.0
                };
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
                for dx in -1i32..=1 {
                    for dy in -1i32..=1 {
                        let key = (cx + dx, cy + dy);
                        if let Some(v) = self.organisms[idx].food_memory.get_mut(&key) {
                            *v *= 0.15;
                        }
                    }
                }
            }
        } else if action == 9 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Water {
                *self.water_use.entry((cx, cy)).or_insert(0) += 1;
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
            } else {
                for dx in -1i32..=1 {
                    for dy in -1i32..=1 {
                        let key = (cx + dx, cy + dy);
                        if let Some(v) = self.organisms[idx].water_memory.get_mut(&key) {
                            *v *= 0.15;
                        }
                    }
                }
            }
        } else if action == 10 {
            signal_reward += social::signal_food(
                idx,
                &mut self.organisms,
                &self.grid,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        } else if action == 11 {
            signal_reward += social::sound_alarm(
                idx,
                &mut self.organisms,
                &self.grid,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        } else if action == 12 {
            if self.tick_count - self.organisms[idx].last_challenged >= 80 {
                let before = signal_reward;
                signal_reward += social::challenge_stranger(
                    idx,
                    &mut self.organisms,
                    self.tick_count,
                    &mut self.events,
                    &mut self.history,
                );
                if signal_reward > before {
                    self.organisms[idx].log_event(format!("challenged a stranger near ({},{})", ix, iy));
                }
            } else {
                self.organisms[idx].think("challenging (nobody)", self.tick_count);
            }
        } else if action == 13 {
            let before = signal_reward;
            signal_reward += social::gift_knowledge(
                idx,
                &mut self.organisms,
                self.tick_count,
                &mut self.events,
                &mut self.history,
                &mut self.rng,
            );
            if signal_reward > before {
                self.organisms[idx].log_event(format!("shared knowledge with kin near ({},{})", ix, iy));

                let actor_lid = self.organisms[idx].lineage_id.clone();
                let neg_target: Option<(usize, String)> = self
                    .organisms
                    .iter()
                    .enumerate()
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id != actor_lid)
                    .filter(|(_, o)| (o.x - ix as f32).abs() + (o.y - iy as f32).abs() < 7.0)
                    .filter_map(|(i, o)| {
                        let att = self.organisms[idx].attitude_toward(&o.lineage_id);
                        let trust = *self.organisms[idx].org_trust.get(&o.id).unwrap_or(&0.0);
                        if att > 0.4 && trust > 0.3 {
                            Some((i, o.lineage_id.clone()))
                        } else {
                            None
                        }
                    })
                    .next();

                if let Some((ti, their_lid)) = neg_target {
                    let neg_key = {
                        let (a, b) = (actor_lid.clone(), their_lid.clone());
                        if a < b {
                            (a, b)
                        } else {
                            (b, a)
                        }
                    };
                    let last_neg = *self.lineage_negotiations.get(&neg_key).unwrap_or(&0);
                    if self.tick_count - last_neg >= 6000 {
                        self.lineage_negotiations.insert(neg_key, self.tick_count);
                        let my_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                        let their_disc: Vec<String> =
                            self.organisms[ti].discoveries.iter().cloned().collect();
                        let their_name = self.organisms[ti].name.clone();
                        let their_oid = self.organisms[ti].id.clone();
                        let my_kin = self
                            .organisms
                            .iter()
                            .filter(|o| o.alive && o.lineage_id == actor_lid)
                            .count();
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: actor_lid.clone(),
                                scenario: "negotiation".to_string(),
                                target_lineage: Some(their_lid),
                                target_org_id: Some(their_oid),
                                discoveries: my_disc,
                                other_name: Some(their_name),
                                other_discoveries: their_disc,
                                kin_count: my_kin,
                                ..Default::default()
                            },
                        );
                    }
                }
            }
        } else if action == 14 {
            if self.organisms[idx].carrying == 0 {
                let tile = self.grid.get(ix, iy);
                let rock_near = [
                    (-1, 0),
                    (1, 0),
                    (0, -1),
                    (0, 1),
                    (-1, -1),
                    (1, -1),
                    (-1, 1),
                    (1, 1),
                ]
                .iter()
                .any(|&(dx, dy)| matches!(self.grid.get(ix + dx, iy + dy), Tile::Rock));
                if rock_near {
                    self.organisms[idx].carrying = 200;
                    self.organisms[idx].carrying_type = 2;
                    signal_reward += 0.015;
                    self.organisms[idx].think("gathering stone", self.tick_count);
                    let name = self.organisms[idx].name.clone();
                    if self.organisms[idx].discover("stone") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "found stone");
                    }
                } else if matches!(tile, Tile::Grass | Tile::Food) {
                    self.organisms[idx].carrying = 250;
                    self.organisms[idx].carrying_type = 1;
                    signal_reward += 0.015;
                    self.organisms[idx].think("gathering wood", self.tick_count);
                    self.organisms[idx].discover("wood");
                }
            }
        } else if action == 15 {
            let tile = self.grid.get(ix, iy);
            if self.organisms[idx].carrying > 0
                && self.organisms[idx].carrying_type != 2
                && matches!(
                    tile,
                    Tile::Grass | Tile::Ash | Tile::Food | Tile::Snow | Tile::Sand
                )
            {
                self.grid.set(ix, iy, Tile::Campfire);
                *self.grid.fire_intensity_mut(ix, iy) = 1.0;
                self.physics.register_fire(ix, iy);
                self.organisms[idx].carrying = 0;
                self.organisms[idx].carrying_type = 0;
                signal_reward += 0.05;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("tending fire", self.tick_count);
                self.organisms[idx].log_event(format!("lit a fire at ({},{})", ix, iy));
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "build",
                    &name,
                    "lit a campfire",
                );
                if self.organisms[idx].discover("fire") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "discovered fire",
                    );
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: self.organisms[idx].lineage_id.clone(),
                            scenario: "discovery".to_string(),
                            context: "fire".to_string(),
                            discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                            ..Default::default()
                        },
                    );
                }
            }
        } else if action == 16 {
            if self.tick_count - self.organisms[idx].last_groomed >= 60 {
                signal_reward += social::groom(idx, &mut self.organisms, self.tick_count, &mut self.events);
            }
        } else if action == 18 {
            let tile = self.grid.get(ix, iy);
            match tile {
                Tile::Sand => {
                    if self.rng.random::<f32>() < 0.06 {
                        self.grid.set(ix, iy, Tile::Water);
                        signal_reward += 0.08;
                        let name = self.organisms[idx].name.clone();
                        self.organisms[idx].think("struck water", self.tick_count);
                        self.organisms[idx].log_event(format!("dug a well at ({},{})", ix, iy));
                        push_event(&mut self.events, self.tick_count, "build", &name, "dug a well");
                        if self.organisms[idx].discover("well") {
                            push_event(
                                &mut self.events,
                                self.tick_count,
                                "build",
                                &name,
                                "discovered well-digging",
                            );
                        }
                    } else {
                        self.organisms[idx].think("digging in the sand", self.tick_count);
                        signal_reward += 0.005;
                    }
                }
                Tile::Grass | Tile::Ash => {
                    let fi = WorldGrid::idx(ix, iy);
                    if self.grid.fertility[fi] < 0.85 {
                        self.grid.fertility[fi] = (self.grid.fertility[fi] + 0.03).min(0.9);
                        signal_reward += 0.015;
                        self.organisms[idx].think("tilling the soil", self.tick_count);
                    }
                }
                _ => {}
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.004).max(0.0);
        } else if action == 19 {
            let fi = WorldGrid::idx(ix, iy);
            let fert = self.grid.fertility[fi];
            if matches!(self.grid.get(ix, iy), Tile::Grass) && self.rng.random::<f32>() < 0.10 + fert * 0.18 {
                self.grid.set(ix, iy, Tile::Food);
                self.grid.reduce_fertility(ix, iy, 0.03);
                signal_reward += 0.02;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("foraging wild food", self.tick_count);
                self.organisms[idx].log_event(format!("foraged wild food at ({},{})", ix, iy));
                if self.organisms[idx].discover("foraging") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "learned to forage",
                    );
                }
            } else {
                self.organisms[idx].think("searching the brush", self.tick_count);
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.003).max(0.0);
        } else if action == 20 {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let kin: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 5.0)
                .map(|(i, _)| i)
                .collect();
            if !kin.is_empty() {
                for &ki in &kin {
                    self.organisms[ki].loneliness = (self.organisms[ki].loneliness - 0.10).max(0.0);
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.12).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                }
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.15).max(0.0);
                signal_reward += 0.006 * kin.len().min(5) as f32;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("dancing with kin", self.tick_count);
                push_event(&mut self.events, self.tick_count, "social", &name, "led a dance");
                if self.organisms[idx].discover("dance") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "social",
                        &name,
                        "invented dance",
                    );
                }
            } else {
                self.organisms[idx].think("dancing alone", self.tick_count);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
            }
        } else if action == 21 {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_vocab = self.organisms[idx].vocabulary.clone();
            let listeners: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| *i != idx && o.alive)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
                .map(|(i, _)| i)
                .collect();
            for &li in &listeners {
                self.organisms[li]
                    .vocabulary
                    .absorb_from(&my_vocab, &mut self.rng);
                self.organisms[li].fear_level = (self.organisms[li].fear_level - 0.05).max(0.0);
                self.organisms[li].comfort = (self.organisms[li].comfort + 0.03).min(1.0);
            }
            self.organisms[idx].think("singing", self.tick_count);
            if !listeners.is_empty() {
                signal_reward += 0.004 * listeners.len().min(6) as f32;
                let name = self.organisms[idx].name.clone();
                if self.organisms[idx].discover("song") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "social",
                        &name,
                        "sang the first song",
                    );
                }
            }
        } else if action == 22 {
            let o = &mut self.organisms[idx];
            o.fear_level = (o.fear_level - 0.06).max(0.0);
            o.boredom = (o.boredom - 0.04).max(0.0);
            o.sleep_debt = (o.sleep_debt - 0.03).max(0.0);
            o.comfort = (o.comfort + 0.04).min(1.0);
            if o.grief_ticks > 0 {
                o.grief_ticks = o.grief_ticks.saturating_sub(2);
            }
            o.think("reflecting quietly", self.tick_count);
            signal_reward += 0.008;
        } else if action == 23 {
            if self.grid.get(ix, iy) == Tile::Food && self.organisms[idx].carry_room() > 0 {
                self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                self.grid.set(ix, iy, Tile::Grass);
                self.grid.reduce_fertility(ix, iy, 0.05);
                signal_reward += 0.01;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("storing food", self.tick_count);
                if self.organisms[idx].discover("food stores") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "began storing food",
                    );
                }
            }
        } else if action == 24 {
            let ms = self.organisms[idx].traits.memory_strength;
            let mut found = 0;
            for dx in -10..=10 {
                for dy in -10..=10 {
                    match self.grid.get(ix + dx, iy + dy) {
                        Tile::Food => {
                            Organism::remember(
                                &mut self.organisms[idx].food_memory,
                                ix + dx,
                                iy + dy,
                                0.6,
                                ms,
                            );
                            found += 1;
                        }
                        Tile::Water => {
                            Organism::remember(
                                &mut self.organisms[idx].water_memory,
                                ix + dx,
                                iy + dy,
                                0.6,
                                ms,
                            );
                            found += 1;
                        }
                        _ => {}
                    }
                }
            }
            self.organisms[idx].think("scouting the area", self.tick_count);
            if found > 0 {
                signal_reward += 0.003;
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.002).max(0.0);
        } else if action == 25 {
            self.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
            self.grid.add_structure(ix, iy, 0.02);
            self.active_structure_tiles.insert((ix, iy));
            self.organisms[idx].think("marking territory", self.tick_count);
            signal_reward += 0.008;
        } else if action >= 26 {
            if let Some(r) = super::actions::try_apply(self, idx, action, ix, iy, spatial) {
                signal_reward += r;
                self.organisms[idx].energy = (self.organisms[idx].energy - 0.0015).max(0.0);
            }
        }

        let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let current_tile = self.grid.get(cx, cy);

        if current_tile == Tile::Fire {
            let fire_dmg = 0.08 * (1.5 - self.organisms[idx].traits.resilience);
            let fire_dmg = if night { fire_dmg * 0.5 } else { fire_dmg };
            if night {
                self.organisms[idx].health = (self.organisms[idx].health + 0.0005).min(1.0);
            }
            self.organisms[idx].health = (self.organisms[idx].health - fire_dmg).max(0.0);
            self.grid.add_hazard(cx, cy, 0.025);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, cx, cy, 0.8, ms);
            self.organisms[idx].think("heat dangerous", self.tick_count);
            self.broadcast_discovery(idx, cx, cy, "danger", 12, spatial);
            if self.rng.random::<f32>() < 0.15 * (1.0 - self.organisms[idx].traits.resilience) {
                self.organisms[idx].infection = (self.organisms[idx].infection + 0.02).min(1.0);
            }
        }

        verify_local_resource_memory(&mut self.organisms[idx], &self.grid, cx, cy);
        verify_local_danger_memory(&mut self.organisms[idx], &self.grid, &self.animals, cx, cy);

        if self.organisms[idx].carrying > 0 {
            self.organisms[idx].carrying -= 1;
            if self.organisms[idx].carrying == 0 {
                self.organisms[idx].carrying_type = 0;
            }
        }

        if self.organisms[idx].carrying > 0 {
            let tile = self.grid.get(cx, cy);
            if matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Hut | Tile::Snow | Tile::Sand
            ) {
                let prev_s = self.grid.structure_at(cx, cy);
                let has_masonry = self.organisms[idx].discoveries.contains("masonry");
                let deposit = match (self.organisms[idx].carrying_type, has_masonry) {
                    (2, true) => 0.0090,
                    (2, false) => 0.0060,
                    _ => 0.0035,
                };
                self.grid.add_structure(cx, cy, deposit);
                self.active_structure_tiles.insert((cx, cy));
                let new_s = self.grid.structure_at(cx, cy);
                let name = self.organisms[idx].name.clone();
                if prev_s < 0.35 && new_s >= 0.35 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "a crude shelter took shape",
                    );
                    if self.organisms[idx].discover("shelter") {
                        push_event(
                            &mut self.events,
                            self.tick_count,
                            "build",
                            &name,
                            "understood shelter",
                        );
                        let lid = self.organisms[idx].lineage_id.clone();
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: lid,
                                scenario: "discovery".to_string(),
                                context: "shelter".to_string(),
                                discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                                ..Default::default()
                            },
                        );
                    }
                }
            }
        }

        let shelter_strength = {
            let mut s = 0.0f32;
            'sw: for ddx in -3i32..=3 {
                for ddy in -3i32..=3 {
                    let nx = cx + ddx;
                    let ny = cy + ddy;
                    let t = self.grid.get(nx, ny);
                    if t == Tile::Campfire {
                        s = 0.55;
                        break 'sw;
                    }
                    if t == Tile::Hut {
                        s = 0.90;
                        break 'sw;
                    }
                    let st = self.grid.structure_at(nx, ny);
                    if st >= 0.35 {
                        s = s.max(st);
                    }
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

            if self.organisms[idx].grief_ticks > 0 && self.rng.random::<f32>() < shelter_strength * 0.12 {
                self.organisms[idx].grief_ticks = self.organisms[idx].grief_ticks.saturating_sub(3);
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
                if self.grid.get(cx + ddx, cy + ddy) == Tile::Water {
                    water_near = true;
                    break 'wn;
                }
            }
        }
        let hydration_mult = if water_near { 0.5 } else { 1.0 };

        self.organisms[idx].energy = (self.organisms[idx].energy - 0.0022 * shelter_drain_mult).max(0.0);
        self.organisms[idx].hydration = (self.organisms[idx].hydration - 0.0014 * hydration_mult).max(0.0);

        let (used_food_reserve, _) = use_needed_reserves(&mut self.organisms[idx], self.tick_count);
        if used_food_reserve {
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
        if !(10.0..=30.0).contains(&temp) {
            let stress = if temp < 10.0 {
                (10.0 - temp) / 40.0
            } else {
                (temp - 30.0) / 70.0
            };
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
                self.organisms[idx].health = (self.organisms[idx].health - 0.001 * (inf - 0.6)).max(0.0);
            }
            let thought = self.organisms[idx].thought.clone();
            if inf > 0.25
                && matches!(
                    thought.as_str(),
                    "exploring" | "observing" | "satisfied" | "on path"
                )
            {
                self.organisms[idx].think("feeling weak", self.tick_count);
            }
            self.organisms[idx].infection *= 0.997;
        }

        if self.organisms[idx].infection > 0.01 {
            let d = &self.organisms[idx].discoveries;
            let med_mult = if d.contains("antibiotics") {
                0.970
            } else if d.contains("alchemy") {
                0.982
            } else if d.contains("medicine") || d.contains("medicine_lore") {
                0.988
            } else if d.contains("poultice") || d.contains("herbalism") {
                0.992
            } else {
                0.997
            };
            self.organisms[idx].infection = (self.organisms[idx].infection * med_mult).max(0.0);
        }

        if self.organisms[idx].inv_water >= 2 && self.tick_count % 7 == (idx as u64 % 7) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.hydration < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| {
                    a.1.hydration
                        .partial_cmp(&b.1.hydration)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].inv_water -= 1;
                self.organisms[ri].hydration = (self.organisms[ri].hydration + 0.22).min(1.0);
                let recipient_id = self.organisms[ri].id.clone();
                let donor_id = self.organisms[idx].id.clone();
                self.organisms[idx].think("sharing water", self.tick_count);
                self.organisms[ri].think("watered by kin", self.tick_count);
                let cur = self.organisms[idx]
                    .org_trust
                    .get(&recipient_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[idx]
                    .org_trust
                    .insert(recipient_id, (cur + 0.03).min(1.0));
                let r_cur = self.organisms[ri]
                    .org_trust
                    .get(&donor_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[ri]
                    .org_trust
                    .insert(donor_id, (r_cur + 0.10).min(1.0));
                self.organisms[ri].comfort = (self.organisms[ri].comfort + 0.03).min(1.0);
                self.history.gifts_total += 1;
            }
        }

        if night && self.tick_count % 17 == (idx as u64 % 17) {
            let (sx, sy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-2i32..=2).any(|ddx| {
                (-2i32..=2)
                    .any(|ddy| matches!(self.grid.get(sx + ddx, sy + ddy), Tile::Campfire | Tile::Fire))
            });
            if near_fire {
                let lid = self.organisms[idx].lineage_id.clone();
                let (fx, fy) = (self.organisms[idx].x, self.organisms[idx].y);
                let listener = self
                    .organisms
                    .iter()
                    .enumerate()
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.age < 1800)
                    .filter(|(_, o)| (o.x - fx).abs() + (o.y - fy).abs() < 3.5)
                    .min_by_key(|(_, o)| o.age)
                    .map(|(i, _)| i);
                if let Some(li) = listener {
                    let ms = self.organisms[li].traits.memory_strength;
                    let food_hints: Vec<((i32, i32), f32)> = self.organisms[idx]
                        .food_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.5)
                        .take(2)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let water_hints: Vec<((i32, i32), f32)> = self.organisms[idx]
                        .water_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.5)
                        .take(2)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    for ((x, y), v) in food_hints {
                        Organism::remember(&mut self.organisms[li].food_memory, x, y, v * 0.3, ms);
                    }
                    for ((x, y), v) in water_hints {
                        Organism::remember(&mut self.organisms[li].water_memory, x, y, v * 0.3, ms);
                    }
                    self.organisms[li].think("listening by the fire", self.tick_count);

                    let story_source = self.organisms[idx]
                        .memories
                        .pick_for_reflection(Some(true))
                        .map(|m| (m.kind, m.text.clone(), m.emotion));
                    if let Some((kind, text, emotion)) = story_source {
                        let teller_name = self.organisms[idx].name.clone();
                        let listener_o = &mut self.organisms[li];
                        let lower = text.trim_end_matches('.').to_lowercase();
                        let retold = format!("{} told me — {}", teller_name, lower);
                        use crate::organism::memory::{MemoryEntry, MemoryKind};
                        let listener_kind = match kind {
                            MemoryKind::Core => MemoryKind::Fact,
                            MemoryKind::Bond => MemoryKind::Episode,
                            other => other,
                        };
                        let entry = MemoryEntry::new(listener_kind, retold, self.tick_count)
                            .with_salience(0.55)
                            .with_emotion(emotion.clamp(-2, 2));
                        listener_o.memories.insert(entry);
                        listener_o.comfort = (listener_o.comfort + 0.01).min(1.0);
                        listener_o.literacy = (listener_o.literacy + 0.0015).min(1.0);
                    }
                }
            }
        }

        if self.organisms[idx].energy > 0.75 && self.tick_count % 5 == (idx as u64 % 5) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.energy < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| {
                    a.1.energy
                        .partial_cmp(&b.1.energy)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].energy = (self.organisms[idx].energy - 0.10).max(0.40);
                self.organisms[ri].energy = (self.organisms[ri].energy + 0.16).min(1.0);
                let recipient_id = self.organisms[ri].id.clone();
                let donor_id = self.organisms[idx].id.clone();
                let donor_name = self.organisms[idx].name.clone();
                self.organisms[idx].think("sharing food", self.tick_count);
                self.organisms[ri].think("fed by kin", self.tick_count);
                let cur = self.organisms[idx]
                    .org_trust
                    .get(&recipient_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[idx]
                    .org_trust
                    .insert(recipient_id, (cur + 0.04).min(1.0));
                let r_cur = self.organisms[ri]
                    .org_trust
                    .get(&donor_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[ri]
                    .org_trust
                    .insert(donor_id, (r_cur + 0.12).min(1.0));
                self.organisms[ri].comfort = (self.organisms[ri].comfort + 0.04).min(1.0);
                self.organisms[ri].joy_ticks = (self.organisms[ri].joy_ticks + 30).min(1200);
                self.organisms[idx].joy_ticks = (self.organisms[idx].joy_ticks + 15).min(1200);
                self.history.gifts_total += 1;
                if self.rng.random::<f32>() < 0.10 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "gift",
                        &donor_name,
                        "shared food with starving kin",
                    );
                }
            }
        }

        if self.organisms[idx].discoveries.contains("trap") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_trail = self.grid.detect_trail(cx2, cy2, TrailKind::Food, 3);
            if food_trail > 0.45 && self.rng.random::<f32>() < 0.0025 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.14).min(1.0);
                self.organisms[idx].think("trap caught something", self.tick_count);
                let name = self.organisms[idx].name.clone();
                push_event(&mut self.events, self.tick_count, "hunt", &name, "trap catch");
            }
        }

        if night && self.organisms[idx].discoveries.contains("ritual") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-3i32..=3)
                .any(|ddx| (-3i32..=3).any(|ddy| self.grid.get(cx2 + ddx, cy2 + ddy) == Tile::Campfire));
            if near_fire {
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.003).min(1.0);
                self.organisms[idx].loneliness = (self.organisms[idx].loneliness - 0.005).max(0.0);
            }
        }

        {
            use crate::world::tiles::Biome;
            let biome = self
                .grid
                .biome_at(self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let pathogen_rate = match biome {
                Biome::Wetland => 0.00050,
                Biome::Volcanic => 0.00020,
                _ => 0.00012,
            };
            if self.organisms[idx].infection < 0.05 && self.rng.random::<f32>() < pathogen_rate {
                self.organisms[idx].infection = 0.35 * (1.0 - self.organisms[idx].traits.resilience * 0.4);
            }
        }

        if self.organisms[idx].infection < 0.8 {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let spreaders: Vec<(f32, f32, f32)> = spatial
                .query(sx as i32, sy as i32, 2)
                .into_iter()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.infection >= 0.15 && (o.x - sx).abs() + (o.y - sy).abs() <= 2.0
                })
                .map(|i| (self.organisms[i].infection, 0.0, 0.0))
                .collect();
            let res = self.organisms[idx].traits.resilience;
            let prev_inf = self.organisms[idx].infection;
            for (other_inf, _, _) in spreaders {
                let spread = 0.015 * other_inf * (1.0 - res * 0.8);
                self.organisms[idx].infection = (self.organisms[idx].infection + spread).min(1.0);
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
            let regen = if self.organisms[idx].age < senescence_start {
                0.001
            } else {
                0.0003
            };
            self.organisms[idx].health = (self.organisms[idx].health + regen).min(1.0);
        }
        if self.organisms[idx].max_age > 0 && self.organisms[idx].age > senescence_start {
            let decline = ((self.organisms[idx].age - senescence_start) as f32
                / (self.organisms[idx].max_age - senescence_start).max(1) as f32)
                .min(1.0);
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.001 * decline).max(0.0);
        }

        self.organisms[idx].age += 1;
        if self.organisms[idx].age.is_multiple_of(100) {
            self.organisms[idx].decay_memory(self.tick_count);
        }

        if self.organisms[idx].nursing_until > self.tick_count {
            if self.organisms[idx].energy < 0.85 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.012).min(1.0);
            }
            if self.organisms[idx].hydration < 0.85 {
                self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.010).min(1.0);
            }
        }

        let mut reward = (self.organisms[idx].energy - prev_energy) * 2.0
            + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        reward += reserve_inventory_feedback(
            prev_energy,
            prev_hydration,
            prev_inv_food,
            prev_inv_water,
            &self.organisms[idx],
        );
        if current_tile == Tile::Fire {
            reward -= 0.5;
        }

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lineage = self.organisms[idx].lineage_id.clone();
        let soc = self.organisms[idx].traits.social_tendency;
        let kin_count = spatial
            .query(ox as i32, oy as i32, 4)
            .into_iter()
            .filter(|&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .count();
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

        let crowding = spatial
            .query(ox as i32, oy as i32, 3)
            .into_iter()
            .filter(|&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
            })
            .count();
        if crowding > 2 {
            let excess = (crowding - 2) as f32;
            reward -= 0.006 * excess * excess;
        }

        if self.organisms[idx].infection < 0.10 && self.organisms[idx].health > 0.4 {
            let healer_bonus = if self.organisms[idx].specialty.as_deref() == Some("healer")
                || self.organisms[idx].specialty.as_deref() == Some("doctor")
                || self.organisms[idx].aspiration == "healer"
            {
                3.0
            } else {
                1.0
            };
            let resilience = self.organisms[idx].traits.resilience;
            if resilience > 0.4 || healer_bonus > 1.0 {
                let sick_kin: Vec<usize> = spatial
                    .query(ox as i32, oy as i32, 3)
                    .into_iter()
                    .filter(|&i| {
                        if i == idx {
                            return false;
                        }
                        let o = &self.organisms[i];
                        o.alive
                            && o.lineage_id == lineage
                            && o.infection > 0.20
                            && (o.x - ox).abs() + (o.y - oy).abs() <= 2.5
                    })
                    .collect();
                if !sick_kin.is_empty() {
                    let care_strength = 0.004 * healer_bonus * (0.5 + resilience);
                    for &ki in &sick_kin {
                        self.organisms[ki].infection =
                            (self.organisms[ki].infection - care_strength).max(0.0);
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.002).min(1.0);
                    }
                    reward += 0.012 * healer_bonus;
                    if self.organisms[idx].thought.is_empty()
                        || self.organisms[idx].thought == "observing"
                        || self.organisms[idx].thought == "exploring"
                    {
                        self.organisms[idx].think("tending to the sick", self.tick_count);
                    }
                }
            }
        }

        let att_adjustments: Vec<(usize, f32)> = self
            .organisms
            .iter()
            .enumerate()
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
                if self.rng.random::<f32>() < 0.04 {
                    let to_share: Vec<((i32, i32), f32)> = self.organisms[i]
                        .food_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.4)
                        .take(1)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let ms = self.organisms[idx].traits.memory_strength;
                    for ((x, y), v) in to_share {
                        Organism::remember(&mut self.organisms[idx].food_memory, x, y, v * 0.12, ms);
                    }
                }
            }
        }

        // Inline fold - no Vec allocation per organism per tick.
        let (kin_sum, kin_count) = self
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .fold((0.0f32, 0u32), |(s, n), o| (s + o.energy, n + 1));
        if kin_count >= 3 && self.organisms[idx].energy > 0.4 {
            let avg = kin_sum / kin_count as f32;
            reward += 0.003 * (avg - 0.5).max(0.0);
        }

        reward += signal_reward;
        reward += movement_reward;

        let loneliness = self.organisms[idx].loneliness;
        let boredom = self.organisms[idx].boredom;
        let comfort = self.organisms[idx].comfort;
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
                        "hunt" if action < 8 => 0.008,
                        "explore" if action < 8 => 0.004,
                        "settle" if action == 17 => 0.006,
                        "settle" if action == 14 || action == 15 => 0.005,
                        "settle" if action == 146 || action == 147 => 0.004,
                        "trade" if action == 13 => 0.008,
                        "defend" if action == 12 => 0.006,
                        _ => 0.0,
                    };
                    reward += bonus;
                }
            }
        }

        let next_perception =
            self.organisms[idx].perceive(&self.grid, &self.organisms, night, animal_near, spatial);
        let next_ix = self.organisms[idx].x as i32;
        let next_iy = self.organisms[idx].y as i32;
        let next_available = crate::sim::actions::available_actions(self, idx, next_ix, next_iy, spatial);
        self.organisms[idx].learn_with_available_actions(
            &perception,
            action,
            reward,
            &next_perception,
            Some(&next_available),
        );

        if self.organisms[idx].energy > 0.7 && self.organisms[idx].hydration > 0.7 {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let neighbour_idxs = spatial.query(ox as i32, oy as i32, 3);
            let nearby_kin = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let nearby_stranger_count = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let thought = self.organisms[idx].thought.clone();
            if nearby_kin >= 1 && matches!(thought.as_str(), "exploring" | "observing" | "satisfied") {
                self.organisms[idx].think("socializing", self.tick_count);
                social::social_knowledge_share(idx, &mut self.organisms, self.tick_count, &mut self.rng);
            } else if nearby_stranger_count >= 1
                && matches!(
                    thought.as_str(),
                    "exploring" | "observing" | "satisfied" | "wary" | "coexisting peacefully"
                )
            {
                let nearest_lid: Option<String> = self
                    .organisms
                    .iter()
                    .filter(|o| {
                        o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                    })
                    .min_by(|a, b| {
                        let da = (a.x - ox).abs() + (a.y - oy).abs();
                        let db = (b.x - ox).abs() + (b.y - oy).abs();
                        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|o| o.lineage_id.clone());
                if let Some(lid) = nearest_lid {
                    if self.organisms[idx].attitude_toward(&lid) >= 0.25 {
                        self.organisms[idx].think("coexisting peacefully", self.tick_count);
                        if self.tick_count % 60 == (idx as u64 % 60) {
                            social::social_knowledge_share(
                                idx,
                                &mut self.organisms,
                                self.tick_count,
                                &mut self.rng,
                            );
                        }
                    } else {
                        self.organisms[idx].think("wary", self.tick_count);
                    }
                }
            } else if matches!(thought.as_str(), "exploring" | "observing") {
                self.organisms[idx].think("satisfied", self.tick_count);
            }
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);

            let unknown_lid: Option<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive && o.lineage_id != my_lid)
                .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 5.0)
                .filter(|o| !self.organisms[idx].lineage_attitudes.contains_key(&o.lineage_id))
                .map(|o| o.lineage_id.clone())
                .next();
            if let Some(stranger_lid) = unknown_lid {
                self.organisms[idx]
                    .lineage_attitudes
                    .insert(stranger_lid.clone(), 0.001);
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario: "first_contact".to_string(),
                        target_lineage: Some(stranger_lid),
                        kin_count: 0,
                        energy_avg: self.organisms[idx].energy,
                        ..Default::default()
                    },
                );
            }

            let last_council = *self.lineage_last_council.get(&my_lid).unwrap_or(&0);
            if self.tick_count - last_council >= 6000 {
                let (kin_sum, kin_count) = self
                    .organisms
                    .iter()
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
                                    let ctx = format!(
                                        "age:{} gen:{} memories:{}",
                                        e.age,
                                        e.generation,
                                        e.danger_memory.len() + e.food_memory.len()
                                    );
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
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: elder_name,
                                lineage_id: my_lid.clone(),
                                scenario: "council".to_string(),
                                kin_count: kin_count as usize,
                                energy_avg: avg,
                                context: elder_ctx,
                                ..Default::default()
                            },
                        );
                    }
                }
            }

            {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy = self.organisms[idx].energy;
                let hydration = self.organisms[idx].hydration;
                let tick = self.tick_count;

                if energy < 0.25
                    && hydration < 0.25
                    && self.organisms[idx].think_ready("survival_crisis", tick, 600)
                {
                    self.organisms[idx].mark_thought("survival_crisis", tick);
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "survival_crisis".to_string(),
                            energy_avg: energy,
                            context: format!("energy={:.0}% water={:.0}%", energy * 100.0, hydration * 100.0),
                            ..Default::default()
                        },
                    );
                } else if energy > 0.85
                    && hydration > 0.85
                    && self.organisms[idx].think_ready("abundance", tick, 2400)
                {
                    let kin_count = self
                        .organisms
                        .iter()
                        .filter(|o| o.alive && o.lineage_id == my_lid)
                        .count();
                    self.organisms[idx].mark_thought("abundance", tick);
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "abundance".to_string(),
                            kin_count,
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                }

                if self.organisms[idx].think_ready("threat", tick, 800) {
                    let (hostile_near, kin_near) = {
                        let org = &self.organisms[idx];
                        let hostile = self
                            .organisms
                            .iter()
                            .filter(|o| o.alive && o.lineage_id != org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .any(|o| org.attitude_toward(&o.lineage_id) < -0.3);
                        let kin = self
                            .organisms
                            .iter()
                            .filter(|o| o.alive && o.lineage_id == org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .count();
                        (hostile, kin)
                    };
                    if hostile_near {
                        self.organisms[idx].mark_thought("threat", tick);
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: my_lid.clone(),
                                scenario: "threat".to_string(),
                                kin_count: kin_near,
                                energy_avg: energy,
                                ..Default::default()
                            },
                        );
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].think_ready("moral_dilemma", self.tick_count, 1500)
                && self.organisms[idx].energy < 0.18
            {
                let _ = last_think;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_partner = self.organisms[idx].partner_id.clone();
                let tempting = self
                    .organisms
                    .iter()
                    .find(|o| {
                        o.alive
                            && o.id != self.organisms[idx].id
                            && o.inv_food > 0
                            && o.lineage_id != my_lid
                            && Some(&o.id) != my_partner.as_ref()
                            && (o.x - ox2).abs() + (o.y - oy2).abs() <= 4.0
                    })
                    .map(|o| o.name.clone());
                if let Some(other_name) = tempting {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "moral_dilemma".to_string(),
                            energy_avg: self.organisms[idx].energy,
                            context: format!("starving, nearby {} carries food", other_name),
                            ..Default::default()
                        },
                    );
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 1500 {
                if let Some(partner_id) = self.organisms[idx].partner_id.clone() {
                    let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                    let my_id = self.organisms[idx].id.clone();
                    let my_sex = self.organisms[idx].sex;
                    let partner = self
                        .organisms
                        .iter()
                        .find(|o| {
                            o.alive && o.id == partner_id && (o.x - ox2).abs() + (o.y - oy2).abs() <= 5.0
                        })
                        .map(|o| (o.name.clone(), o.x, o.y));
                    if let Some((partner_name, px, py)) = partner {
                        let third = self
                            .organisms
                            .iter()
                            .find(|o| {
                                o.alive
                                    && o.id != my_id
                                    && o.id != partner_id
                                    && o.sex != my_sex
                                    && (o.x - px).abs() + (o.y - py).abs() <= 5.0
                            })
                            .map(|o| o.name.clone());
                        if let Some(third_name) = third {
                            self.organisms[idx].last_think_tick = self.tick_count;
                            self.push_think_for(
                                idx,
                                ThinkTrigger {
                                    org_id: self.organisms[idx].id.clone(),
                                    org_name: self.organisms[idx].name.clone(),
                                    lineage_id: my_lid.clone(),
                                    scenario: "jealousy".to_string(),
                                    energy_avg: self.organisms[idx].energy,
                                    context: format!("{} lingers near {}", third_name, partner_name),
                                    ..Default::default()
                                },
                            );
                        }
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                use crate::organism::organism::Sex;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_id = self.organisms[idx].id.clone();
                let my_sex = self.organisms[idx].sex;
                let my_age = self.organisms[idx].age;
                let my_eng = self.organisms[idx].energy;
                if my_sex == Sex::Male && my_age > 1200 && my_eng > 0.4 {
                    let rival = self
                        .organisms
                        .iter()
                        .find(|o| {
                            o.alive
                                && o.id != my_id
                                && o.sex == Sex::Male
                                && o.lineage_id == my_lid
                                && o.age > 1200
                                && o.energy > 0.4
                                && (o.x - ox2).abs() + (o.y - oy2).abs() <= 6.0
                        })
                        .map(|o| o.name.clone());
                    if let Some(other_name) = rival {
                        self.organisms[idx].last_think_tick = self.tick_count;
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: my_lid.clone(),
                                scenario: "rivalry".to_string(),
                                energy_avg: my_eng,
                                context: format!("brother {} threatens", other_name),
                                ..Default::default()
                            },
                        );
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
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario: "migration_urge".to_string(),
                        energy_avg: self.organisms[idx].energy,
                        context: "land starves; old paths fail".to_string(),
                        ..Default::default()
                    },
                );
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                let loneliness = self.organisms[idx].loneliness;
                let boredom = self.organisms[idx].boredom;
                let energy = self.organisms[idx].energy;

                if loneliness > 0.78 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "lonely".to_string(),
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                } else if boredom > 0.72 && energy > 0.75 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "restless".to_string(),
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                }
            }

            let season_now = self.season();
            if scarcity_driven_migration_season(season_now) {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let last_think_m = self.organisms[idx].last_think_tick;
                let food_nearby = (-6i32..=6).any(|ddx| {
                    (-6i32..=6).any(|ddy| self.grid.get(ox2 as i32 + ddx, oy2 as i32 + ddy) == Tile::Food)
                });
                if !food_nearby && self.tick_count - last_think_m >= 8000 {
                    let kin_count = self
                        .organisms
                        .iter()
                        .filter(|o| o.alive && o.lineage_id == my_lid)
                        .count();
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "migration".to_string(),
                            kin_count,
                            energy_avg: self.organisms[idx].energy,
                            context: format!("season={} food_scarce=true", season_now),
                            ..Default::default()
                        },
                    );
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
                    let life_top: Vec<String> = self.organisms[idx]
                        .life_log
                        .iter()
                        .rev()
                        .take(3)
                        .map(|e| e.text.clone())
                        .collect();
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "invention".to_string(),
                            discoveries: disc_vec,
                            life_log_top: life_top,
                            context: candidates.join(", "),
                            ..Default::default()
                        },
                    );
                }
            }

            if night
                && !self.organisms[idx].has_reflected
                && self.organisms[idx].age > 800
                && self.organisms[idx].life_log.len() >= 4
            {
                self.organisms[idx].has_reflected = true;
                let life_top: Vec<String> = self.organisms[idx]
                    .life_log
                    .iter()
                    .take(5)
                    .map(|e| e.text.clone())
                    .collect();
                let org = &self.organisms[idx];
                let emotional = format!(
                    "fear={:.1} comfort={:.1} lonely={:.1}",
                    org.fear_level, org.comfort, org.loneliness
                );
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: org.id.clone(),
                        org_name: org.name.clone(),
                        lineage_id: org.lineage_id.clone(),
                        scenario: "reflection".to_string(),
                        life_log_top: life_top,
                        emotional_state: emotional,
                        ..Default::default()
                    },
                );
            }
        }

        if self.organisms[idx].energy > 0.82 && self.tick_count - self.organisms[idx].last_fed_kin >= 180 {
            social::share_food(idx, &mut self.organisms, self.tick_count, &mut self.events);
        }

        // Any organism with knowledge can teach nearby kin - not just elders.
        // Stagger by idx so not all organisms try to teach on the same tick.
        let can_teach = !self.organisms[idx].discoveries.is_empty() || self.organisms[idx].is_elder;
        if can_teach && self.tick_count % 120 == (idx as u64 % 120) {
            social::teach(
                idx,
                &mut self.organisms,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        }

        if self.tick_count % 2000 == (idx as u64 % 2000) {
            {
                let org = &mut self.organisms[idx];
                if org.danger_memory.len() > 15 {
                    org.traits.aggression = (org.traits.aggression + 0.005).min(1.0);
                    org.traits.fear = (org.traits.fear + 0.003).min(1.0);
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
            let food_near = (-8i32..=8)
                .any(|ddx| (-8i32..=8).any(|ddy| self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near
                && self.organisms[idx].food_memory.len() < 8
                && self.rng.random::<f32>() < 0.0015
                && self.organisms[idx].wander_target.is_none()
                && self.organisms[idx].energy > 0.4
            {
                let hash = self.tick_count ^ idx as u64;
                let tx = (ox2 + ((hash % 40) as i32 - 20)).clamp(5, WIDTH as i32 - 5);
                let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).clamp(5, HEIGHT as i32 - 5);
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].think("migrating for food", self.tick_count);
            }
        }

        {
            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].infection > 0.5 && self.tick_count - last_think >= 1200 {
                self.organisms[idx].last_think_tick = self.tick_count;
                let energy = self.organisms[idx].energy;
                let lid = self.organisms[idx].lineage_id.clone();
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: lid,
                        scenario: "illness".to_string(),
                        energy_avg: energy,
                        context: format!("infection={:.0}%", self.organisms[idx].infection * 100.0),
                        ..Default::default()
                    },
                );
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
                self.organisms[idx].log_life_rel(
                    tc,
                    "loss",
                    format!("lost my beloved {}", partner_name),
                    Some(pid_owned),
                    Some(partner_name),
                );
            }
        }
        if let Some(ref aid) = self.organisms[idx].attracted_to.clone() {
            let gone = !self
                .organisms
                .iter()
                .any(|o| o.alive && &o.id == aid && o.partner_id.is_none());
            if gone {
                self.organisms[idx].attracted_to = None;
            }
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
            let my_sex = self.organisms[idx].sex;
            let my_age = self.organisms[idx].age as f32;
            let my_lid = self.organisms[idx].lineage_id.clone();
            let my_atts = self.organisms[idx].lineage_attitudes.clone();
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
            let target = self
                .organisms
                .iter()
                .filter(|o| o.alive && o.sex != my_sex && o.age > 1000 && o.partner_id.is_none())
                .map(|o| {
                    let dist = (o.x - ox).hypot(o.y - oy);
                    (o, dist)
                })
                .filter(|(_, d)| *d <= MATE_SEEK_MAX_TILES)
                .map(|(o, dist)| {
                    let lineage_att = if o.lineage_id == my_lid {
                        0.3
                    } else {
                        my_atts.get(&o.lineage_id).copied().unwrap_or(0.0)
                    };
                    let trust = my_trust.get(&o.id).copied().unwrap_or(0.0);
                    let age_gap = (my_age - o.age as f32).abs();
                    let age_score = (1.0 - age_gap / 6000.0).clamp(0.0, 1.0);
                    let dist_score = (1.0 - dist / 30.0).clamp(0.0, 1.0);
                    // Hard-reject hostile lineages even if nearby.
                    let viable = lineage_att > -0.3;
                    let score = if viable {
                        dist_score * 0.35 + lineage_att * 0.25 + trust * 0.20 + age_score * 0.20
                    } else {
                        -1.0
                    };
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
            let best = friend_ids
                .iter()
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
            let alive_ids: std::collections::HashSet<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.id.clone())
                .collect();
            self.organisms[idx].friends.retain(|id, _| alive_ids.contains(id));
        }

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.rng.random::<f32>() < 0.012
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let candidate = self
                .organisms
                .iter()
                .enumerate()
                .find(|(i, o)| {
                    *i != idx
                        && o.alive
                        && o.partner_id.is_none()
                        && o.attracted_to.is_none()
                        && o.age > 1000
                        && o.sex != my_sex
                        && (o.x - ox).hypot(o.y - oy) < 120.0
                })
                .map(|(i, _)| i);
            if let Some(ci) = candidate {
                let cid = self.organisms[ci].id.clone();
                let cname = self.organisms[ci].name.clone();
                let my_id = self.organisms[idx].id.clone();
                self.organisms[idx].attracted_to = Some(cid.clone());
                self.organisms[idx].attraction_tick = tc;
                self.organisms[ci].attracted_to = Some(my_id);
                self.organisms[ci].attraction_tick = tc;
                self.organisms[idx].think(&format!("drawn to {}", cname), tc);
            }
        }

        if is_unpartnered_adult {
            let attracted_to = self.organisms[idx].attracted_to.clone();
            if let Some(ref aid) = attracted_to {
                let aid = aid.clone();
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let attraction_age = tc.saturating_sub(self.organisms[idx].attraction_tick);
                let partner_close = self
                    .organisms
                    .iter()
                    .any(|o| o.alive && o.id == aid && (o.x - ox).hypot(o.y - oy) < 8.0);
                if partner_close && attraction_age >= 150 && self.rng.random::<f32>() < 0.08 {
                    if let Some(pi) = self.organisms.iter().position(|o| o.alive && o.id == aid) {
                        let pid = self.organisms[pi].id.clone();
                        let pname = self.organisms[pi].name.clone();
                        let oid = self.organisms[idx].id.clone();
                        let oname = self.organisms[idx].name.clone();
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[pi]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            "courtship",
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.pending_convos.push(req);
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx].record_conversation_outcome(
                            &pid, &b_lid, &pname, "courtship", None, tc,
                        );
                        self.organisms[pi].record_conversation_outcome(
                            &oid, &a_lid, &oname, "courtship", None, tc,
                        );
                        self.organisms[idx].partner_id = Some(pid.clone());
                        self.organisms[idx].attracted_to = None;
                        self.organisms[pi].partner_id = Some(oid.clone());
                        self.organisms[pi].attracted_to = None;
                        self.organisms[idx].joy_ticks = (self.organisms[idx].joy_ticks + 500).min(1200);
                        self.organisms[pi].joy_ticks = (self.organisms[pi].joy_ticks + 500).min(1200);
                        self.organisms[idx].think(&format!("fell for {}", pname), tc);
                        self.organisms[idx].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", pname),
                            Some(pid.clone()),
                            Some(pname.clone()),
                        );
                        self.organisms[pi].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", oname),
                            Some(oid),
                            Some(oname.clone()),
                        );
                    }
                }
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let pid = pid.clone();
            if tc % 19 == (idx as u64 % 19) && self.rng.random::<f32>() < 0.0018 {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                if let Some(pi) = self.organisms.iter().position(|o| o.alive && o.id == pid) {
                    if (self.organisms[pi].x - ox).hypot(self.organisms[pi].y - oy) < 8.0 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[pi]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            "bonded",
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.pending_convos.push(req);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_name = self.organisms[pi].name.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx].record_conversation_outcome(
                            &pid, &b_lid, &b_name, "bonded", None, tc,
                        );
                        self.organisms[pi].record_conversation_outcome(
                            &a_id, &a_lid, &a_name, "bonded", None, tc,
                        );
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
                    self.organisms
                        .iter()
                        .enumerate()
                        .filter(|(i, o)| {
                            *i != idx
                                && o.alive
                                && partner_id.as_deref() != Some(&o.id)
                                && (o.x - ox).hypot(o.y - oy) < 6.0
                        })
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
                    if self.rng.random::<f32>() < 0.004 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[ci]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[ci]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[ci].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[ci],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            kind,
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[ci].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[ci].store_conversation(conv_b);
                        self.pending_convos.push(req);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let c_id = self.organisms[ci].id.clone();
                        let c_name = self.organisms[ci].name.clone();
                        self.organisms[idx].record_conversation_outcome(
                            &c_id, &their_lid, &c_name, kind, None, tc,
                        );
                        self.organisms[ci].record_conversation_outcome(
                            &a_id, &a_lid, &a_name, kind, None, tc,
                        );
                    }
                }
            }
        }

        growth::try_reproduce(
            idx,
            &mut self.organisms,
            &self.grid,
            self.tick_count,
            &mut self.events,
            &mut self.history,
            &mut self.rng,
            alive_count,
            lineage_counts,
        );

        let death_grief: Option<(i32, i32, String)> = {
            let org = &self.organisms[idx];
            let dying = org.energy <= 0.0
                || org.hydration <= 0.0
                || org.health <= 0.0
                || (org.max_age > 0 && org.age >= org.max_age);
            if dying {
                Some((org.x as i32, org.y as i32, org.lineage_id.clone()))
            } else {
                None
            }
        };

        let org = &mut self.organisms[idx];
        if org.energy <= 0.0 || org.hydration <= 0.0 || org.health <= 0.0 {
            org.alive = false;
            org.think("dying", self.tick_count);
            let cause = if org.health <= 0.0 && org.infection > 0.3 {
                self.history.deaths_sickness += 1;
                "sickness"
            } else if org.energy <= 0.0 {
                self.history.deaths_starvation += 1;
                "starvation"
            } else if org.hydration <= 0.0 {
                self.history.deaths_dehydration += 1;
                "dehydration"
            } else {
                self.history.deaths_combat += 1;
                "combat"
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
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "migration",
                    &name,
                    &format!("died {} tiles from home, far from where they were born", dist),
                );
            }
        } else if org.max_age > 0 && org.age >= org.max_age {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            let msg = format!("gen{} age {} - old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        if !self.organisms[idx].alive {
            use crate::organism::memory::MemoryKind;
            let dead = &self.organisms[idx];
            let mut legacy: Option<(String, String, u32)> = None;
            let mut best_score = 0u32;
            for m in dead.memories.entries.iter() {
                if matches!(m.kind, MemoryKind::Core) {
                    continue;
                }
                let score = m.recall_count.saturating_mul(8) + ((m.salience * 100.0) as u32);
                if score > best_score {
                    best_score = score;
                    legacy = Some((dead.name.clone(), m.text.clone(), m.recall_count));
                }
            }
            if let Some((name, text, recalls)) = legacy {
                let suffix = if recalls > 5 {
                    format!(" (held in mind {} times)", recalls)
                } else {
                    String::new()
                };
                self.headlines.push_back((
                    self.tick_count,
                    format!("{} is gone. What they carried: \"{}\"{}", name, text, suffix),
                ));
                while self.headlines.len() > 80 {
                    self.headlines.pop_front();
                }
            }
        }

        if !self.organisms[idx].alive {
            let dead = &self.organisms[idx];
            let bequest = dead.wealth;
            if bequest > 0 {
                let dead_id = dead.id.clone();
                let dead_name = dead.name.clone();
                let dead_lid = dead.lineage_id.clone();
                let partner_id = dead.partner_id.clone();
                let heir_idx: Option<usize> = {
                    let mut found: Option<usize> = None;
                    if let Some(pid) = partner_id.as_ref() {
                        found = self.organisms.iter().position(|o| o.alive && &o.id == pid);
                    }
                    if found.is_none() {
                        let mut best: Option<(usize, u32)> = None;
                        for (i, o) in self.organisms.iter().enumerate() {
                            if !o.alive {
                                continue;
                            }
                            if o.parent_id != dead_id && o.father_id.as_deref() != Some(&dead_id) {
                                continue;
                            }
                            if let Some((_, a)) = best {
                                if o.age <= a {
                                    continue;
                                }
                            }
                            best = Some((i, o.age));
                        }
                        found = best.map(|(i, _)| i);
                    }
                    if found.is_none() {
                        let mut best: Option<(usize, i32)> = None;
                        for (i, o) in self.organisms.iter().enumerate() {
                            if !o.alive || o.lineage_id != dead_lid {
                                continue;
                            }
                            let d = (o.x - self.organisms[idx].x).abs() as i32
                                + (o.y - self.organisms[idx].y).abs() as i32;
                            if let Some((_, bd)) = best {
                                if d >= bd {
                                    continue;
                                }
                            }
                            best = Some((i, d));
                        }
                        found = best.map(|(i, _)| i);
                    }
                    found
                };
                if let Some(hi) = heir_idx {
                    self.organisms[hi].wealth = self.organisms[hi].wealth.saturating_add(bequest);
                    let heir_name = self.organisms[hi].name.clone();
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "trade",
                        &dead_name,
                        &format!("{} inherited {} from {}", heir_name, bequest, dead_name),
                    );
                }
                self.organisms[idx].wealth = 0;
            }
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
                if i == idx || !o.alive {
                    continue;
                }
                let near_kin =
                    o.lineage_id == dlid && (o.x as i32 - dx).abs() + (o.y as i32 - dy).abs() <= 12;
                let child =
                    o.parent_id == dead_id_str || o.father_id.as_deref() == Some(dead_id_str.as_str());
                let friend = o.friends.contains_key(&dead_id_str);
                if near_kin || child || friend {
                    griever_set.insert(i);
                }
            }
            let grievers: Vec<usize> = griever_set.into_iter().collect();

            let griever_count = grievers.len();

            let inherited_food: Vec<((i32, i32), f32)> = self.organisms[idx]
                .food_memory
                .iter()
                .filter(|(_, &v)| v > 0.5)
                .take(5)
                .map(|(&k, &v)| (k, v))
                .collect();
            let inherited_water: Vec<((i32, i32), f32)> = self.organisms[idx]
                .water_memory
                .iter()
                .filter(|(_, &v)| v > 0.5)
                .take(5)
                .map(|(&k, &v)| (k, v))
                .collect();
            let inherited_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();

            let dead_id = self.organisms[idx].id.clone();
            for gi in &grievers {
                let ms = self.organisms[*gi].traits.memory_strength;
                Organism::remember(&mut self.organisms[*gi].danger_memory, dx, dy, 0.65, ms);
                self.organisms[*gi].fear_level = (self.organisms[*gi].fear_level + 0.22).min(1.0);
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
                    use crate::organism::memory::{MemoryEntry, MemoryKind};
                    let is_father =
                        self.organisms[*gi].father_id.as_deref() == Some(self.organisms[idx].id.as_str());
                    let parent_word = if is_father { "father" } else { "mother" };
                    self.organisms[*gi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Bond,
                            format!("I lost my {} {} when I was small", parent_word, dead_name),
                            self.tick_count,
                        )
                        .with_salience(0.97)
                        .with_emotion(-3)
                        .with_related(dead_id.clone()),
                    );
                }
                self.organisms[*gi].grief_ticks = grief_base + self.rng.random_range(0u32..40);
                self.organisms[*gi].think("mourning kin", self.tick_count);
                let tc = self.tick_count;
                let dn = dead_name.clone();
                let di = dead_id.clone();
                self.organisms[*gi].log_life_rel(
                    tc,
                    "loss",
                    format!("witnessed {} die", dn),
                    Some(di),
                    Some(dn),
                );

                for &((mx, my), v) in &inherited_food {
                    Organism::remember(&mut self.organisms[*gi].food_memory, mx, my, v * 0.4, ms);
                }
                for &((mx, my), v) in &inherited_water {
                    Organism::remember(&mut self.organisms[*gi].water_memory, mx, my, v * 0.4, ms);
                }
                let is_widow = self.organisms[*gi].partner_id.as_ref() == Some(&self.organisms[idx].id);
                let is_direct_kin = is_widow
                    || self.organisms[*gi].parent_id == self.organisms[idx].id
                    || self.organisms[*gi].father_id.as_ref() == Some(&self.organisms[idx].id);
                if is_direct_kin {
                    for d in &inherited_disc {
                        if !self.organisms[*gi].discoveries.contains(d.as_str())
                            && self.rng.random::<f32>() < 0.45
                        {
                            self.organisms[*gi].discoveries.insert(d.clone());
                        }
                    }
                }
                if is_widow {
                    use crate::organism::memory::{MemoryEntry, MemoryKind};
                    self.organisms[*gi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Bond,
                            format!("I lost {}, who slept beside me through the years", dead_name),
                            self.tick_count,
                        )
                        .with_salience(0.98)
                        .with_emotion(-3)
                        .with_related(dead_id.clone()),
                    );
                    self.organisms[*gi].grief_ticks = (self.organisms[*gi].grief_ticks + 200).min(800);
                    self.organisms[*gi].comfort = (self.organisms[*gi].comfort - 0.30).max(0.0);
                    self.organisms[*gi].partner_id = None;
                }
            }

            if griever_count >= 2 {
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "mourn",
                    &dead_name,
                    &format!("{} kin gather to mourn", griever_count),
                );
            }

            let ritual_participants: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| {
                    *i != idx
                        && o.alive
                        && o.lineage_id == dlid
                        && (((o.x as i32 - dx).pow(2) + (o.y as i32 - dy).pow(2)) as f32).sqrt() <= 6.0
                })
                .map(|(i, _)| i)
                .collect();
            if !ritual_participants.is_empty() {
                let participant_ids: Vec<String> = ritual_participants
                    .iter()
                    .map(|&pi| self.organisms[pi].id.clone())
                    .collect();
                for (slot, &pi) in ritual_participants.iter().enumerate() {
                    self.organisms[pi].grief_ticks = self.organisms[pi].grief_ticks.saturating_sub(20);
                    self.organisms[pi].log_event("mourned together".to_string());
                    for (other_slot, other_id) in participant_ids.iter().enumerate() {
                        if other_slot == slot {
                            continue;
                        }
                        let cur = self.organisms[pi].org_trust.get(other_id).copied().unwrap_or(0.0);
                        self.organisms[pi]
                            .org_trust
                            .insert(other_id.clone(), (cur + 0.12).min(1.0));
                    }
                }
            }

            if let Some(&gi) = grievers.first() {
                let energy = self.organisms[gi].energy;
                let lid = self.organisms[gi].lineage_id.clone();
                self.push_think_for(
                    gi,
                    ThinkTrigger {
                        org_id: self.organisms[gi].id.clone(),
                        org_name: self.organisms[gi].name.clone(),
                        lineage_id: lid,
                        scenario: "grief".to_string(),
                        energy_avg: energy,
                        context: format!("lost {} - {} kin mourn", dead_name, griever_count),
                        ..Default::default()
                    },
                );
            }

            self.grid.add_hazard(dx, dy, 0.45);
            self.grid.reduce_fertility(dx, dy, 0.08);
            for (ndx, ndy) in [(-1i32, 0), (1, 0), (0, -1i32), (0, 1)] {
                self.grid.add_hazard(dx + ndx, dy + ndy, 0.18);
                self.grid.reduce_fertility(dx + ndx, dy + ndy, 0.03);
            }
            for ddx in -2i32..=2 {
                for ddy in -2i32..=2 {
                    if ddx.abs() + ddy.abs() == 2 {
                        self.grid.add_hazard(dx + ddx, dy + ddy, 0.06);
                    }
                }
            }

            if self.rng.random::<f32>() < 0.25 && matches!(self.grid.get(dx, dy), Tile::Grass | Tile::Ash) {
                self.grid.set(dx, dy, Tile::Food);
            }
        }
    }

    fn spawn_animals(&mut self, count: usize) {
        for _ in 0..count {
            let r = self.rng.random::<f32>();
            let kind = if r < 0.32 {
                AnimalKind::Rabbit
            } else if r < 0.55 {
                AnimalKind::Deer
            } else if r < 0.70 {
                AnimalKind::Boar
            } else if r < 0.84 {
                AnimalKind::Bird
            } else if r < 0.92 {
                AnimalKind::Fish
            } else {
                AnimalKind::Wolf
            };
            self.spawn_animal_of_kind(kind);
        }
    }

    fn spawn_animal_of_kind(&mut self, kind: AnimalKind) {
        for _ in 0..60 {
            let x = self.rng.random_range(3..(WIDTH as i32 - 3)) as f32;
            let y = self.rng.random_range(3..(HEIGHT as i32 - 3)) as f32;
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
                return;
            }
        }
    }

    fn tick_animals(&mut self) {
        // Passive respawn floor. Without this, a transient extinction
        // (drought + hunting + wolves eating prey then starving) leaves
        // the world animal-less forever, since reproduction requires
        // living parents. Every 600 ticks, if the population dipped
        // below the floor, drip-spawn some back.
        if self.tick_count > 0 && self.tick_count.is_multiple_of(600) {
            let alive = self.animals.iter().filter(|a| a.alive).count();
            const ANIMAL_FLOOR: usize = 40;
            if alive < ANIMAL_FLOOR {
                let to_add = (ANIMAL_FLOOR - alive).min(10);
                self.spawn_animals(to_add);
            }

            const PER_KIND_FLOOR: &[(AnimalKind, usize)] = &[
                (AnimalKind::Rabbit, 14),
                (AnimalKind::Deer, 10),
                (AnimalKind::Boar, 6),
                (AnimalKind::Bird, 8),
                (AnimalKind::Fish, 6),
                (AnimalKind::Wolf, 4),
            ];
            for &(kind, floor) in PER_KIND_FLOOR {
                let count = self.animals.iter().filter(|a| a.alive && a.kind == kind).count();
                if count < floor {
                    let need = (floor - count).min(3);
                    for _ in 0..need {
                        self.spawn_animal_of_kind(kind);
                    }
                }
            }
        }

        use crate::world::tiles::Biome;

        let org_pos: Vec<(f32, f32)> = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| (o.x, o.y))
            .collect();

        let prey_pos_for_chase: Vec<(f32, f32)> = self
            .animals
            .iter()
            .filter(|a| a.alive && matches!(a.kind, AnimalKind::Rabbit | AnimalKind::Deer))
            .map(|a| (a.x, a.y))
            .collect();
        for animal in &mut self.animals {
            animal.tick(&self.grid, &org_pos, &prey_pos_for_chase, &mut self.rng);
        }

        let prey_positions: Vec<(usize, f32, f32, AnimalKind)> = self
            .animals
            .iter()
            .enumerate()
            .filter(|(_, a)| a.alive && matches!(a.kind, AnimalKind::Rabbit | AnimalKind::Deer))
            .map(|(i, a)| (i, a.x, a.y, a.kind))
            .collect();
        let mut kills: Vec<(usize, usize)> = Vec::new();
        for (pi, pred) in self.animals.iter().enumerate() {
            if !pred.alive || !matches!(pred.kind, AnimalKind::Wolf) {
                continue;
            }
            if pred.energy > 0.85 {
                continue;
            }
            for (vi, vx, vy, _) in prey_positions.iter().copied() {
                if vi == pi {
                    continue;
                }
                let d = (vx - pred.x).abs() + (vy - pred.y).abs();
                if d <= 1.5 {
                    kills.push((pi, vi));
                    break;
                }
            }
        }
        for (pi, vi) in kills {
            if !self.animals[pi].alive || !self.animals[vi].alive {
                continue;
            }
            let gain = match self.animals[vi].kind {
                AnimalKind::Rabbit => 0.40,
                AnimalKind::Deer => 0.65,
                _ => 0.20,
            };
            self.animals[vi].alive = false;
            self.animals[pi].energy = (self.animals[pi].energy + gain).min(1.0);
        }

        let mut tames: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || !matches!(a.kind, AnimalKind::Wolf) {
                continue;
            }
            if a.energy >= 0.4 {
                continue;
            }
            for (oi, o) in self.organisms.iter().enumerate() {
                if !o.alive || o.energy < 0.7 {
                    continue;
                }
                if o.traits.aggression > 0.5 {
                    continue;
                }
                if (o.x - a.x).abs() + (o.y - a.y).abs() > 2.5 {
                    continue;
                }
                let tame_p = 0.004 + (1.0 - o.traits.aggression) * 0.006;
                if self.rng.random::<f32>() < tame_p {
                    tames.push((ai, oi));
                    break;
                }
            }
        }
        for (ai, oi) in tames {
            self.animals[ai].kind = AnimalKind::Dog;
            self.animals[ai].bonded_org = Some(self.organisms[oi].id.clone());
            self.animals[ai].energy = (self.animals[ai].energy + 0.30).min(1.0);
            let dog_name = crate::organism::animal::pick_dog_name(&mut self.rng);
            self.animals[ai].name = Some(dog_name.clone());
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].discoveries.insert("dog".to_string());
            self.organisms[oi].joy_ticks = (self.organisms[oi].joy_ticks + 300).min(1200);
            self.organisms[oi].think(&format!("named the wolf {}", dog_name), self.tick_count);
            self.organisms[oi].log_event(format!("named their dog {}", dog_name));
            push_event(
                &mut self.events,
                self.tick_count,
                "build",
                &oname,
                &format!("befriended a wolf and named it {}", dog_name),
            );
        }

        for ai in 0..self.animals.len() {
            if !self.animals[ai].alive {
                continue;
            }
            if !matches!(self.animals[ai].kind, AnimalKind::Dog) {
                continue;
            }
            let bonded = self.animals[ai].bonded_org.clone();
            if let Some(bid) = bonded {
                let (ax, ay) = (self.animals[ai].x, self.animals[ai].y);
                let mut owner_idx: Option<usize> = None;
                if let Some((oi, o)) = self
                    .organisms
                    .iter()
                    .enumerate()
                    .find(|(_, o)| o.alive && o.id == bid)
                {
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
                    if dist < 5.0 {
                        owner_idx = Some(oi);
                    }
                }
                if let Some(oi) = owner_idx {
                    let o = &mut self.organisms[oi];
                    o.loneliness = (o.loneliness - 0.004).max(0.0);
                    o.boredom = (o.boredom - 0.002).max(0.0);
                    o.comfort = (o.comfort + 0.001).min(1.0);
                }
            }
        }

        let mut bites: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || !matches!(a.kind, AnimalKind::Wolf) {
                continue;
            }
            let (ax, ay) = (a.x, a.y);
            for (oi, o) in self.organisms.iter().enumerate() {
                if !o.alive {
                    continue;
                }
                let manh = (o.x - ax).abs() + (o.y - ay).abs();
                if manh <= 1.5 {
                    let kin_nearby = self
                        .organisms
                        .iter()
                        .filter(|k| k.alive && k.id != o.id && k.lineage_id == o.lineage_id)
                        .filter(|k| (k.x - ax).abs() + (k.y - ay).abs() <= 3.0)
                        .count();
                    let pack_defence = if kin_nearby >= 2 { 0.5 } else { 1.0 };
                    let weak_bonus = if o.health < 0.5 || o.energy < 0.3 {
                        0.20
                    } else {
                        0.0
                    };
                    let bite_p = (0.18 + a.energy * 0.10 + weak_bonus) * pack_defence;
                    if self.rng.random::<f32>() < bite_p {
                        bites.push((ai, oi));
                    }
                }
            }
        }
        for (ai, oi) in bites {
            let dmg = 0.12 + self.rng.random::<f32>() * 0.08;
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].health = (self.organisms[oi].health - dmg).max(0.0);
            self.organisms[oi].think("a wolf attacks", self.tick_count);
            self.organisms[oi].fear_level = (self.organisms[oi].fear_level + 0.25).min(1.0);
            self.animals[ai].energy = (self.animals[ai].energy + 0.20).min(1.0);
            push_event(
                &mut self.events,
                self.tick_count,
                "danger",
                &oname,
                "mauled by a wolf",
            );
        }

        let candidates: Vec<(usize, f32, f32, AnimalKind)> = self
            .animals
            .iter()
            .filter(|a| a.alive && a.energy > 0.70 && self.tick_count.saturating_sub(a.last_reproduced) > 800)
            .map(|a| (a.id, a.x, a.y, a.kind))
            .collect();

        let kind_cap = |k: AnimalKind| -> usize {
            match k {
                AnimalKind::Rabbit => 130,
                AnimalKind::Deer => 110,
                AnimalKind::Boar => 90,
                AnimalKind::Bird => 120,
                AnimalKind::Fish => 110,
                AnimalKind::Wolf => 45,
                AnimalKind::Dog => 40,
            }
        };
        let mut kind_alive: HashMap<AnimalKind, usize> = HashMap::new();
        for a in self.animals.iter().filter(|a| a.alive) {
            *kind_alive.entry(a.kind).or_insert(0) += 1;
        }

        for (pid, px, py, kind) in candidates {
            if kind_alive.get(&kind).copied().unwrap_or(0) >= kind_cap(kind) {
                continue;
            }
            let biome = self.grid.biome_at(px as i32, py as i32);
            let biome_mult: f32 = match (kind, biome) {
                (AnimalKind::Rabbit, Biome::Grassland) => 1.5,
                (AnimalKind::Rabbit, Biome::Wetland) => 1.3,
                (AnimalKind::Rabbit, Biome::Forest) => 1.0,
                (AnimalKind::Rabbit, Biome::Desert) => 0.4,
                (AnimalKind::Rabbit, Biome::Tundra) => 0.5,
                (AnimalKind::Rabbit, Biome::Volcanic) => 0.1,
                (AnimalKind::Deer, Biome::Forest) => 1.6,
                (AnimalKind::Deer, Biome::Grassland) => 1.2,
                (AnimalKind::Deer, Biome::Wetland) => 1.0,
                (AnimalKind::Deer, Biome::Tundra) => 0.6,
                (AnimalKind::Deer, Biome::Desert) => 0.3,
                (AnimalKind::Deer, Biome::Volcanic) => 0.1,
                (AnimalKind::Boar, Biome::Forest) => 1.8,
                (AnimalKind::Boar, Biome::Wetland) => 1.5,
                (AnimalKind::Boar, Biome::Grassland) => 1.0,
                (AnimalKind::Boar, _) => 0.3,
                (AnimalKind::Bird, Biome::Forest) => 1.4,
                (AnimalKind::Bird, Biome::Wetland) => 1.3,
                (AnimalKind::Bird, Biome::Grassland) => 1.1,
                (AnimalKind::Bird, Biome::Tundra) => 0.7,
                (AnimalKind::Bird, Biome::Desert) => 0.4,
                (AnimalKind::Bird, Biome::Volcanic) => 0.1,
                (AnimalKind::Fish, Biome::Wetland) => 1.0,
                (AnimalKind::Fish, _) => 0.7,
                (AnimalKind::Wolf, Biome::Forest) => 1.2,
                (AnimalKind::Wolf, Biome::Tundra) => 1.4,
                (AnimalKind::Wolf, Biome::Grassland) => 0.8,
                (AnimalKind::Wolf, _) => 0.3,
                (AnimalKind::Dog, _) => 0.0,
            };

            let local_density = self
                .animals
                .iter()
                .filter(|a| a.alive && (a.x - px).abs() + (a.y - py).abs() <= 14.0)
                .count() as f32;
            let density_factor = (1.0 - (local_density / 3.0).min(1.0)).max(0.0);

            let total_alive = self.animals.iter().filter(|a| a.alive).count() as f32;
            let global_factor = (1.0 - (total_alive - 600.0).max(0.0) / 400.0).max(0.0);

            let p = 0.0005 * biome_mult * density_factor * global_factor;
            if p > 0.0 && self.rng.random::<f32>() < p {
                let nid = self.next_animal_id;
                self.next_animal_id += 1;
                let ox = self.rng.random_range(-3.0..3.0f32);
                let oy = self.rng.random_range(-3.0..3.0f32);
                let nx = (px + ox).max(1.0).min(WIDTH as f32 - 2.0);
                let ny = (py + oy).max(1.0).min(HEIGHT as f32 - 2.0);
                self.animals.push(Animal::new(nid, nx, ny, kind));
                *kind_alive.entry(kind).or_insert(0) += 1;
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
            if !org.alive {
                continue;
            }
            let (ox, oy) = (org.x as i32, org.y as i32);
            animal_spatial.query_into(ox, oy, 3, &mut nearby_animals);
            for &ai in &nearby_animals {
                let animal = &self.animals[ai];
                if !animal.alive {
                    continue;
                }
                let (ax, ay) = (animal.x as i32, animal.y as i32);
                let manh = (ox - ax).abs() + (oy - ay).abs();
                if manh <= 2 {
                    if matches!(animal.kind, AnimalKind::Dog) {
                        continue;
                    }
                    let base_p = match animal.kind {
                        AnimalKind::Rabbit => 0.32,
                        AnimalKind::Deer => 0.18,
                        AnimalKind::Boar => 0.14,
                        AnimalKind::Bird => 0.16,
                        AnimalKind::Fish => 0.26,
                        AnimalKind::Wolf => 0.10,
                        _ => 0.0,
                    };
                    let weapon_bonus = if org.discoveries.contains("spear") {
                        0.22
                    } else if org.discoveries.contains("stone_tools") {
                        0.12
                    } else if org.discoveries.contains("hunt") {
                        0.06
                    } else {
                        0.0
                    };
                    let dist_penalty = if manh == 2 { 0.6 } else { 1.0 };
                    let p = (base_p + org.traits.aggression * 0.18 + weapon_bonus) * dist_penalty;
                    if self.rng.random::<f32>() < p {
                        to_catch.push((oi, ai));
                    }
                }
            }
        }

        let mut caught: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for (oi, ai) in to_catch {
            if caught.contains(&ai) {
                continue;
            }
            caught.insert(ai);
            let (kind, boost, meat, leather_chance, food_yield) = match self.animals[ai].kind {
                AnimalKind::Rabbit => ("rabbit", 0.30, 1u8, 0.40f32, 1u8),
                AnimalKind::Deer => ("deer", 0.55, 3u8, 0.85f32, 3u8),
                AnimalKind::Boar => ("boar", 0.65, 3u8, 0.75f32, 3u8),
                AnimalKind::Bird => ("bird", 0.18, 1u8, 0.05f32, 1u8),
                AnimalKind::Fish => ("fish", 0.32, 1u8, 0.00f32, 2u8),
                AnimalKind::Wolf => ("wolf", 0.45, 2u8, 0.90f32, 1u8),
                AnimalKind::Dog => ("dog", 0.0, 0u8, 0.00f32, 0u8),
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
            let pack_kin = organism_spatial
                .query(hunter_x as i32, hunter_y as i32, 5)
                .into_iter()
                .filter(|&i| i != oi)
                .filter(|&i| {
                    let o = &self.organisms[i];
                    o.alive
                        && o.lineage_id == hunter_lid
                        && (o.x - hunter_x).abs() + (o.y - hunter_y).abs() <= 5.0
                })
                .count();
            let pack_bonus = if pack_kin >= 3 {
                0.14
            } else if pack_kin >= 1 {
                0.06
            } else {
                0.0
            };
            if pack_kin >= 2 {
                let name = self.organisms[oi].name.clone();
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "hunt",
                    &name,
                    &format!(
                        "pack hunt: {} kin ({} {})",
                        pack_kin,
                        kind,
                        if pack_kin >= 3 { "coordinated!" } else { "helped" }
                    ),
                );
            }
            self.organisms[oi].energy =
                (self.organisms[oi].energy + boost + tool_bonus + pack_bonus).min(1.0);
            self.organisms[oi].inv_food = self.organisms[oi].inv_food.saturating_add(food_yield);
            if meat > 0 {
                let cur = self.organisms[oi].tools.get("meat").copied().unwrap_or(0);
                let next = (cur as u16 + meat as u16).min(8) as u8;
                self.organisms[oi].tools.insert("meat".to_string(), next);
            }
            if leather_chance > 0.0 && self.rng.random::<f32>() < leather_chance {
                let cur = self.organisms[oi].tools.get("leather").copied().unwrap_or(0);
                let next = (cur as u16 + 1).min(8) as u8;
                self.organisms[oi].tools.insert("leather".to_string(), next);
            }
            self.organisms[oi].think("hunting", self.tick_count);
            self.organisms[oi].log_event(format!("hunted a {} at ({},{})", kind, ax, ay));
            self.organisms[oi].discover("hunt");
            self.organisms[oi].discover("hunting");
            Organism::remember(&mut self.organisms[oi].food_memory, ax, ay, 0.65, ms);

            {
                use crate::organism::memory::{MemoryEntry, MemoryKind};
                let is_first = !self.organisms[oi].attributes.contains("milestone:first_hunt");
                if is_first {
                    self.organisms[oi]
                        .attributes
                        .insert("milestone:first_hunt".to_string());
                    self.organisms[oi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Episode,
                            format!("my first kill — a {} fell to my hand", kind),
                            self.tick_count,
                        )
                        .with_salience(0.85)
                        .with_emotion(2),
                    );
                    self.organisms[oi].joy_ticks = (self.organisms[oi].joy_ticks + 50).min(1200);
                } else if matches!(kind, "deer" | "boar" | "wolf") {
                    self.organisms[oi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Episode,
                            format!("brought down a {} that day", kind),
                            self.tick_count,
                        )
                        .with_salience(0.55)
                        .with_emotion(1),
                    );
                }
            }

            if pack_kin >= 1 {
                let share = if pack_kin >= 3 { 0.12 } else { 0.08 };
                let helpers: Vec<usize> = organism_spatial
                    .query(hunter_x as i32, hunter_y as i32, 5)
                    .into_iter()
                    .filter(|&i| i != oi)
                    .filter(|&i| {
                        let o = &self.organisms[i];
                        o.alive
                            && o.lineage_id == hunter_lid
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

        let fatigue = (ticks.saturating_sub(4) as f32 * 0.00045) + 0.0015 + depth * 0.004;
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

    fn broadcast_discovery(
        &mut self,
        actor_idx: usize,
        x: i32,
        y: i32,
        rtype: &str,
        radius: i32,
        spatial: &SpatialIndex,
    ) {
        let (ax, ay) = (self.organisms[actor_idx].x, self.organisms[actor_idx].y);
        let mut buf: Vec<usize> = Vec::with_capacity(16);
        spatial.query_into(ax as i32, ay as i32, radius, &mut buf);
        for &i in &buf {
            if i == actor_idx || !self.organisms[i].alive {
                continue;
            }
            let dist = ((self.organisms[i].x - ax).abs() + (self.organisms[i].y - ay).abs()) as i32;
            if dist > radius {
                continue;
            }
            let strength = 0.25 * (1.0 - dist as f32 / radius as f32);
            let ms = self.organisms[i].traits.memory_strength;
            match rtype {
                "food" => Organism::remember(&mut self.organisms[i].food_memory, x, y, strength, ms),
                "water" => Organism::remember(&mut self.organisms[i].water_memory, x, y, strength, ms),
                "danger" => Organism::remember(&mut self.organisms[i].danger_memory, x, y, strength, ms),
                _ => {}
            }
        }
    }

    #[cfg(test)]
    fn current_nearby_organisms(&self, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let spatial = SpatialIndex::build(&self.organisms, 10);
        spatial
            .query(x, y, radius)
            .into_iter()
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive && ((o.x as i32 - x).abs() + (o.y as i32 - y).abs()) <= radius
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

        let alive_indices: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, _)| i)
            .collect();
        if alive_indices.is_empty() {
            return;
        }

        for _ in 0..ORGS_TO_CHECK {
            let idx = alive_indices[self.rng.random_range(0..alive_indices.len())];
            if now.saturating_sub(self.organisms[idx].last_ancestral_thought) < COOLDOWN_TICKS {
                continue;
            }
            let org_lid = self.organisms[idx].lineage_id.clone();
            let ox = self.organisms[idx].x;
            let oy = self.organisms[idx].y;
            let Some(samples) = self.lineage_centroid_history.get(&org_lid) else {
                continue;
            };
            let mut matched: Option<i32> = None;
            for s in samples.iter() {
                if s[0] >= ancient_cutoff {
                    break;
                }
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
            e.0 += o.x;
            e.1 += o.y;
            e.2 += 1;
        }
        let tick = self.tick_count as i32;
        let alive_lineages: HashSet<String> = sums.keys().map(|s| s.to_string()).collect();
        for (lid_str, (sx, sy, n)) in sums {
            if n == 0 {
                continue;
            }
            let cx = (sx / n as f32) as i32;
            let cy = (sy / n as f32) as i32;
            let entry = self
                .lineage_centroid_history
                .entry(lid_str.to_string())
                .or_default();
            entry.push_back([tick, cx, cy]);
            if entry.len() > 60 {
                entry.pop_front();
            }
            // Stamp the ancestral home the first time we ever see
            // this lineage. Never overwritten - even when the last
            // living member is 200 tiles away, the home stays
            // anchored to where the lineage was born.
            self.lineage_homes
                .entry(lid_str.to_string())
                .or_insert([cx, cy, 30]);
        }
        let cutoff = tick - 30 * DAY_LENGTH as i32;
        self.lineage_centroid_history.retain(|lid, samples| {
            if alive_lineages.contains(lid) {
                return true;
            }
            samples.back().map(|s| s[0] >= cutoff).unwrap_or(false)
        });
    }

    fn tick_settlements(&mut self) {
        const TIER_NAMES: [&str; 6] = ["wilderness", "camp", "hamlet", "village", "town", "city"];
        const THRESHOLDS: [usize; 6] = [0, 4, 10, 22, 40, 70];

        let mut built: Vec<(i32, i32)> = self
            .active_structure_tiles
            .iter()
            .filter(|&&(x, y)| {
                self.grid.structure_at(x, y) >= 0.35
                    || matches!(self.grid.get(x, y), Tile::Hut | Tile::Campfire)
            })
            .copied()
            .collect();
        if built.len() > 4000 {
            built.truncate(4000);
        }

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
                if count >= need {
                    tier = t as u8;
                }
            }
            let prev = *self.settlement_tiers.get(&lid).unwrap_or(&0);
            if tier > prev {
                self.settlement_tiers.insert(lid.clone(), tier);
                let tribe = self
                    .lineage_names
                    .get(&lid)
                    .cloned()
                    .unwrap_or_else(|| "a tribe".to_string());
                let msg = format!("{}'s settlement grew into a {}", tribe, TIER_NAMES[tier as usize]);
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
                if dx * dx + dy * dy > radius * radius {
                    continue;
                }
                let tx = (cx + dx).clamp(0, crate::world::grid::WIDTH as i32 - 1);
                let ty = (cy + dy).clamp(0, crate::world::grid::HEIGHT as i32 - 1);
                if matches!(self.grid.get(tx, ty), Tile::Water | Tile::Void) {
                    continue;
                }
                to_claim.push((tx, ty));
            }
        }
        let tiles = self.territory.entry(lid.to_string()).or_default();
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

    pub fn era(&self, lineage_id: &str) -> super::era::Era {
        self.lineage_eras
            .get(lineage_id)
            .copied()
            .unwrap_or(super::era::Era::PreStone)
    }

    fn tick_water_depletion(&mut self) {
        const OVERDRINK_THRESHOLD: u32 = 200;
        const KEEP_FRACTION: f32 = 0.6;
        if self.water_use.is_empty() {
            return;
        }
        let snapshot: Vec<((i32, i32), u32)> = self
            .water_use
            .iter()
            .filter(|(_, n)| **n >= OVERDRINK_THRESHOLD)
            .map(|(k, v)| (*k, *v))
            .collect();
        for ((cx, cy), _n) in snapshot {
            if self.grid.get(cx, cy) != Tile::Water {
                continue;
            }
            let mut water_neighbours = 0;
            for &(dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
                if self.grid.get(cx + dx, cy + dy) == Tile::Water {
                    water_neighbours += 1
                }
            }
            if water_neighbours <= 1 {
                self.grid.set(cx, cy, Tile::Sand);
                self.water_use.remove(&(cx, cy));
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "drought",
                    "world",
                    &format!("a pond at ({},{}) dried out from overuse", cx, cy),
                );
            }
        }
        for (_, n) in self.water_use.iter_mut() {
            *n = ((*n as f32) * KEEP_FRACTION) as u32;
        }
        self.water_use.retain(|_, n| *n > 0);
    }

    fn update_lineage_eras(&mut self) {
        use super::era::{determine_era_for_lineage, Era};
        let mut agg: HashMap<String, (HashSet<String>, usize)> = HashMap::new();
        for org in self.organisms.iter().filter(|o| o.alive) {
            let entry = agg
                .entry(org.lineage_id.clone())
                .or_insert_with(|| (HashSet::new(), 0));
            entry.1 += 1;
            for d in org.discoveries.iter() {
                entry.0.insert(d.clone());
            }
        }
        let mut max_era: Option<Era> = None;
        let alive_lineages: HashSet<String> = agg.keys().cloned().collect();
        for (lid, (discoveries, pop)) in agg.iter() {
            let prev = self.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone);
            let discovered_era = determine_era_for_lineage(discoveries, *pop);
            let new_era = discovered_era.max(prev);
            if new_era > prev {
                let lname = self
                    .lineage_names
                    .get(lid)
                    .cloned()
                    .unwrap_or_else(|| lid.clone());
                let detail = format!("{} entered the {} era", lname, new_era.name());
                push_event(&mut self.events, self.tick_count, "era_advance", &lname, &detail);
            }
            self.lineage_eras.insert(lid.clone(), new_era);
            max_era = Some(match max_era {
                Some(m) => {
                    if new_era > m {
                        new_era
                    } else {
                        m
                    }
                }
                None => new_era,
            });
        }
        self.lineage_eras.retain(|k, _| alive_lineages.contains(k));
        if let Some(m) = max_era {
            let mname = m.name().to_string();
            if mname != self.current_era {
                self.history.era_history.push_back(EraEntry {
                    tick: self.tick_count,
                    era: mname.clone(),
                });
                if self.history.era_history.len() > 60 {
                    self.history.era_history.pop_front();
                }
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "era",
                    "world",
                    &format!("the {} era begins", mname),
                );
                self.current_era = mname;
            }
        }
    }

    fn compute_era(&self) -> String {
        let alive = self.organisms.iter().filter(|o| o.alive).count();
        if alive == 0 {
            return "extinction".to_string();
        }
        let food_tiles = self.grid.tiles.iter().filter(|&&t| t == Tile::Food as i8).count();
        let food_per_cap = food_tiles as f32 / alive.max(1) as f32;
        let pop_trend = if self.pop_history.len() >= 5 {
            let recent = self.pop_history[self.pop_history.len() - 1][1] as f32;
            let older = self.pop_history[self.pop_history.len() - 5][1] as f32;
            (recent - older) / (older + 1.0)
        } else {
            0.0
        };
        if alive < 6 {
            return "collapse".to_string();
        }
        if self.drought.active && food_per_cap < 2.0 {
            return "drought".to_string();
        }
        if food_per_cap > 14.0 && pop_trend > 0.08 {
            return "abundance".to_string();
        }
        if food_per_cap < 2.5 && pop_trend < -0.05 {
            return "collapse".to_string();
        }
        if pop_trend > 0.12 {
            return "expansion".to_string();
        }
        if pop_trend < -0.08 {
            return "decline".to_string();
        }
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
            return rest
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        }
    }
    0
}

#[cfg(test)]
#[path = "simulation_tests.rs"]
mod tests;
