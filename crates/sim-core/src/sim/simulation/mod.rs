use super::config::{
    season_growth, DAY_LENGTH, DEFAULT_MAX_POPULATION, MAX_POPULATION_LIMIT, MIN_POPULATION_LIMIT, SEASONS,
    SEASON_LENGTH,
};
use super::spatial::SpatialIndex;
use super::world_events::{
    push_event, tick_drought, tick_outbreak, tick_weather, tick_world_evolution, DroughtState, WeatherState,
};
use super::{courtship, growth, social};
use crate::organism::animal::{Animal, AnimalKind};
use crate::organism::attributes::check_earned_attributes;
use crate::organism::decision_bias::directive_aligns_action;
use crate::organism::organism::{Hot, Organism, DIRECTIONS};
use crate::physics::engine::PhysicsEngine;
use crate::world::{
    grid::{TrailKind, WorldGrid, HEIGHT, WIDTH},
    tiles::Tile,
};
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha8Rng;
use rustc_hash::FxHashMap;
use rustc_hash::{FxHashMap as HashMap, FxHashSet as HashSet};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Preserve population order while limiting lineage-wide reads to its members.
mod animals;
mod census;
mod helpers;
mod lineage;
mod memory;
mod organism_tick;
mod separation;
mod strategy;
mod territory;
mod tick;
mod types;
mod world;

pub use types::*;

use helpers::*;
use memory::read_self_rss_kb_local;

pub struct Simulation {
    pub grid: WorldGrid,
    pub physics: PhysicsEngine,
    pub organisms: Vec<Organism>,
    pub animals: Vec<Animal>,
    pub tick_count: u64,
    pub(crate) population_limit: usize,
    pub events: VecDeque<Event>,
    pub history: History,
    pub drought: DroughtState,
    pub weather: WeatherState,
    pub flood_tiles: Vec<(i32, i32, u64)>,
    /// The gods' wards over the land (see `civ::wards`).
    pub wards: Vec<super::civ::wards::Ward>,
    /// Today's smoke from industry (runtime; recomputed daily).
    pub(crate) smog: Vec<super::civ::smog::SmogSource>,
    /// Player-planted crops, orchards and saplings, keyed by tile index.
    pub plantings: std::collections::BTreeMap<u32, crate::sim::tech::plantings::Planting>,
    /// Prayers tribes send the player, and the faith answering them earns.
    pub prayers: crate::sim::civ::prayers::PrayerState,
    /// This winter is a hard one: colder, hungrier, sicker.
    pub hard_winter: bool,
    /// Autumn's forecast that the coming winter will be hard.
    pub hard_winter_ahead: bool,
    pub story_history: VecDeque<StoryEntry>,
    pub pending_memory_flushes: Vec<PendingMemoryFlush>,
    pub lineage_names: HashMap<String, String>,
    pub lineage_strategies: HashMap<String, (String, u64)>,
    pub lineage_strategy_objectives: HashMap<String, StrategyObjective>,
    pub lineage_strategy_history: VecDeque<StrategyCampaignRecord>,
    pub(crate) lineage_elders: HashMap<String, String>,
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
    /// The highest generation born in each tribe, counted from 1 for the founders.
    pub lineage_generations_reached: HashMap<String, u32>,
    /// Unrest building in each tribe whose wealth gap is stark (civ/society/unrest.rs).
    pub lineage_unrest: HashMap<String, f32>,
    pub(crate) lineage_aggregates: HashMap<String, LineageAggregate>,
    pub buildings: super::buildings::BuildingList,
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
    pub lineage_peak_pop: HashMap<String, u32>,
    /// Tribes the world has warned are on the brink (runtime; re-detected
    /// within one check after a load).
    pub(crate) tribe_peril: HashMap<String, super::civ::peril::Peril>,
    /// When each tribe last began a festival (runtime).
    pub(crate) festival_last: HashMap<String, u64>,
    /// The recently dead, newest last: who died and when (runtime).
    pub(crate) fallen: VecDeque<(String, u64)>,
    /// When each tribe last had someone raised from the dead (runtime).
    pub(crate) revive_cooldown: HashMap<String, u64>,
    /// When each tribe was last taught by the gods (runtime).
    pub(crate) teach_cooldown: HashMap<String, u64>,
    /// Where grown people died, waiting for a gravestone (runtime).
    pub(crate) grave_queue: Vec<(String, f32, f32)>,
    /// Where each tribe's cemetery lies (runtime; found again after a load).
    pub(crate) cemeteries: HashMap<String, (i32, i32)>,
    /// Orphans already taken in, so each is told of once (runtime).
    pub(crate) orphans_cared: HashSet<String>,
    /// Each tribe's recent deaths and their causes, newest last (runtime).
    pub(crate) recent_deaths: HashMap<String, VecDeque<(u64, &'static str)>>,
    /// When each faith lost its last follower (runtime).
    pub(crate) faith_empty_since: HashMap<String, u64>,
    pub headlines: VecDeque<(u64, String)>,
    pub trades: VecDeque<super::civ::economy::Trade>,
    pub trade_routes: Vec<super::civ::trade_routes::TradeRoute>,
    pub caravans: Vec<super::civ::trade_routes::Caravan>,
    /// Roads villages have laid to their wells, fields and neighbouring villages (see `civ::land::village_roads`).
    pub village_roads: Vec<super::civ::land::village_roads::VillageRoad>,
    pub next_trade_route_id: u32,
    pub next_caravan_id: u32,
    pub water_use: HashMap<(i32, i32), u32>,
    pub current_era: String,
    pub sex_words: [String; 2],
    pub world_seed: u64,
    pub(crate) next_animal_id: usize,
    /// Wild animals of each censused kind at the last census (not saved: a
    /// reload takes a fresh census before it announces anything).
    pub(crate) animal_census: Vec<u32>,
    pub(crate) rng: ChaCha8Rng,
    pub last_immigration_tick: u64,
    pub(crate) cached_tribal_relations: serde_json::Value,
    pub(crate) cached_lineage_sizes: serde_json::Value,
    pub(crate) slow_compute_tick: u64,
    /// Incremented whenever construction, ownership, damage, repair, or
    /// eviction changes a building so the wire can publish it immediately
    /// without shipping the entire building list on every hot frame.
    pub(crate) building_state_revision: u64,
    pub(crate) serialized_building_state_revision: u64,
    /// Bumped whenever a planting is added, removed or changes stage.
    pub(crate) planting_revision: u64,
    pub(crate) serialized_planting_revision: u64,
    pub(crate) active_structure_tiles: HashSet<(i32, i32)>,
    pub(crate) field_fortifications: Vec<super::warfare::FieldFortification>,
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

impl Simulation {
    pub fn new(seed: u64) -> Self {
        let rng = ChaCha8Rng::seed_from_u64(seed);
        let grid = WorldGrid::new(seed);
        let mut physics = PhysicsEngine::new();
        physics.register_existing_fires(&grid);

        let sex_words = {
            use crate::organism::vocabulary::gen_phoneme_word;
            use rand::SeedableRng;
            let mut word_rng = rand_chacha::ChaCha8Rng::seed_from_u64(seed.wrapping_add(0xc0ffee));
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
            population_limit: DEFAULT_MAX_POPULATION,
            events: VecDeque::new(),
            history: History::default(),
            drought: DroughtState::default(),
            weather: WeatherState::default(),
            flood_tiles: Vec::new(),
            wards: Vec::new(),
            smog: Vec::new(),
            plantings: Default::default(),
            prayers: Default::default(),
            hard_winter: false,
            hard_winter_ahead: false,
            story_history: VecDeque::new(),
            pending_memory_flushes: Vec::new(),
            lineage_names: HashMap::default(),
            lineage_strategies: HashMap::default(),
            lineage_strategy_objectives: HashMap::default(),
            lineage_strategy_history: VecDeque::new(),
            lineage_elders: HashMap::default(),
            pop_history: VecDeque::new(),
            lineage_centroid_history: HashMap::default(),
            lineage_homes: HashMap::default(),
            lineage_eras: HashMap::default(),
            lineage_generations_reached: HashMap::default(),
            lineage_unrest: HashMap::default(),
            lineage_aggregates: HashMap::default(),
            buildings: Default::default(),
            next_building_id: 1,
            governments: HashMap::default(),
            religions: Vec::new(),
            next_religion_id: 1,
            artworks: Vec::new(),
            next_artwork_id: 1,
            festivals: Vec::new(),
            next_festival_id: 1,
            action_counts: HashMap::default(),
            decision_counts: HashMap::default(),
            workshop_hits: HashMap::default(),
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
            milestones_achieved: HashSet::default(),
            lineage_peak_pop: HashMap::default(),
            tribe_peril: HashMap::default(),
            festival_last: HashMap::default(),
            fallen: VecDeque::new(),
            revive_cooldown: HashMap::default(),
            teach_cooldown: HashMap::default(),
            grave_queue: Vec::new(),
            cemeteries: HashMap::default(),
            orphans_cared: HashSet::default(),
            recent_deaths: HashMap::default(),
            faith_empty_since: HashMap::default(),
            headlines: VecDeque::new(),
            trades: VecDeque::new(),
            trade_routes: Vec::new(),
            village_roads: Vec::new(),
            caravans: Vec::new(),
            next_trade_route_id: 1,
            next_caravan_id: 1,
            water_use: HashMap::default(),
            current_era: "genesis".to_string(),
            sex_words,
            world_seed: seed,
            next_animal_id: 0,
            animal_census: Vec::new(),
            rng,
            last_immigration_tick: 0,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes: serde_json::Value::Array(vec![]),
            slow_compute_tick: 0,
            building_state_revision: 0,
            serialized_building_state_revision: 0,
            planting_revision: 0,
            serialized_planting_revision: 0,
            active_structure_tiles: HashSet::default(),
            field_fortifications: Vec::new(),
            settlement_tiers: HashMap::default(),
            territory: HashMap::default(),
            tile_owner: HashMap::default(),
            cached_territory: serde_json::Value::Null,
        };
        sim.spawn_founders();
        sim.spawn_animals(14);
        sim
    }

    /// Sets the natural population ceiling for this runtime. Hosted and WASM
    /// worlds keep the conservative default; downloadable worlds can opt into
    /// a much larger long game without changing the save format.
    pub fn set_population_limit(&mut self, limit: usize) -> usize {
        self.population_limit = limit.clamp(MIN_POPULATION_LIMIT, MAX_POPULATION_LIMIT);
        self.population_limit
    }

    pub fn population_limit(&self) -> usize {
        self.population_limit
    }
}

#[cfg(test)]
mod aggregate_tests;
#[cfg(test)]
mod tests;
