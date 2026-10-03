use super::traits::Traits;
use super::vocabulary::Vocabulary;
use crate::sim::buildings::Building;
use crate::world::{
    grid::{TrailKind, WorldGrid},
    tiles::Tile,
};
use rand::{Rng, RngExt};
use rustc_hash::FxHashMap;
use rustc_hash::FxHashMap as HashMap;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

mod basics;
mod helpers;
mod inner;
mod json;
mod learning;
mod movement;
mod perception;
mod records;
mod state;
#[cfg(test)]
mod tests;

pub use basics::*;
use helpers::*;
pub use json::*;
pub use records::*;

pub struct Organism {
    pub id: String,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub prev_x: f32,
    pub prev_y: f32,
    pub vx_smooth: f32,
    pub vy_smooth: f32,
    pub energy: f32,
    pub hydration: f32,
    pub health: f32,
    pub age: u32,
    pub alive: bool,
    pub thought: String,
    /// True when `thought` was set this tick. The SoA delta builder
    /// reads + clears this so we only ship a per-org thought string
    /// over the wire when it changed. Initialised to `true` so a
    /// freshly-spawned org's first thought reaches the client.
    pub thought_dirty: bool,
    pub generation: u32,
    pub parent_id: String,
    pub father_id: Option<String>,
    pub lineage_id: String,
    pub max_age: u32,

    pub food_memory: FxHashMap<(i32, i32), f32>,
    pub water_memory: FxHashMap<(i32, i32), f32>,
    pub danger_memory: FxHashMap<(i32, i32), f32>,

    pub thought_history: VecDeque<ThoughtEntry>,

    pub q_table: FxHashMap<String, QRow>,

    pub last_reproduced: u64,
    pub last_challenged: u64,

    pub lineage_attitudes: BTreeMap<String, f32>,
    pub org_trust: BTreeMap<String, f32>,

    pub traits: Traits,
    pub infection: f32,
    pub carrying: u32,
    pub carrying_type: u8,

    pub vocabulary: Vocabulary,
    pub daily_story: String,
    pub last_story_tick: u64,
    pub life_log: VecDeque<LifeEvent>,
    pub discoveries: BTreeSet<String>,

    pub home_x: f32,
    pub home_y: f32,
    pub home_furniture: Vec<String>,
    pub home_style_seed: u32,

    pub is_elder: bool,
    pub has_reflected: bool,
    pub last_invention_tick: u64,
    pub last_experiment_tick: u64,

    pub directive: String,
    pub directive_until: u64,
    pub last_think_tick: u64,
    pub last_think_by_kind: BTreeMap<String, u64>,

    pub loneliness: f32,
    pub boredom: f32,
    pub fear_level: f32,
    pub comfort: f32,
    pub mood: f32,
    pub hope: f32,
    pub awe: f32,
    pub gratitude: f32,
    pub jealousy: f32,
    pub anger: f32,
    pub regret: f32,
    pub curiosity_drive: f32,
    pub spiritual: f32,

    pub grief_ticks: u32,
    /// Lingering emotional uplift. Bumped by partner / child / discovery /
    /// milestone. Decays naturally. Counterpart to grief_ticks.
    pub joy_ticks: u32,
    /// Long-term life aspiration assigned at adulthood. Biases action
    /// rewards toward the aspiration's category. Persists for life.
    pub aspiration: String,
    /// Tick at which this org last lost a parent (parent_id / father_id
    /// matched a death event). Used by kin in the social tick to bias
    /// share_food / groom toward newly-orphaned minors. 0 = never.
    pub orphaned_tick: u64,
    pub sleep_debt: f32,
    pub water_ticks: u32,
    /// What last hurt this person, and when: a death is told by its true
    /// cause instead of every wound counting as combat. Runtime only.
    pub last_harm: Option<(Harm, u64)>,
    pub area_ticks: u32,
    pub last_area_cell: (i32, i32),
    pub wander_target: Option<(i32, i32)>,
    pub journey: Option<Journey>,
    /// Remembered route around obstacles; runtime only, never saved.
    pub route: std::cell::RefCell<super::navigation::RouteCache>,
    pub last_groomed: u64,
    pub last_fed_kin: u64,
    pub last_ancestral_thought: u64,

    pub partner_id: Option<String>,
    pub children_count: u32,
    pub sex: Sex,

    pub attracted_to: Option<String>,
    pub attraction_tick: u64,

    pub pregnant: bool,
    pub pregnancy_start: u64,

    pub inv_water: u8,
    pub inv_food: u8,
    pub inv_wood: u8,
    pub inv_stone: u8,

    pub nursing_until: u64,

    pub wealth: u32,
    pub literacy: f32,
    pub schooling_ticks: u32,
    pub university_ticks: u32,
    pub piety: f32,
    pub specialty: Option<String>,
    pub religion_id: Option<String>,
    pub degrees: Vec<String>,
    pub tools: BTreeMap<String, u8>,
    pub diseases: Vec<(String, u64)>,
    pub disease_immunity: BTreeMap<String, u64>,
    pub mounted_vehicle: Option<u32>,
    pub is_leader: bool,

    pub conversations: VecDeque<ConversationEntry>,

    // Named friends: org_id → name. Forms from repeated positive interaction.
    // Unlike org_trust (which is anonymous and decays), friendships are recognized bonds.
    pub friends: BTreeMap<String, String>,

    // Accumulated descriptors: birth traits (handsome, curious) + earned ones (builder, sage).
    pub attributes: BTreeSet<String>,

    pub anchor_events: Vec<(u64, String, f32)>,

    pub memories: super::memory::MemoryStore,

    pub birth_tick: u64,
    pub zodiac: String,
}

impl Organism {
    pub fn new(
        id: String,
        name: String,
        x: f32,
        y: f32,
        generation: u32,
        parent_id: String,
        lineage_id: String,
        max_age: u32,
        traits: Traits,
    ) -> Self {
        Organism {
            id,
            name,
            x,
            y,
            prev_x: x,
            prev_y: y,
            vx_smooth: 0.0,
            vy_smooth: 0.0,
            energy: 1.0,
            hydration: 1.0,
            health: 1.0,
            age: 0,
            alive: true,
            thought: "observing".to_string(),
            thought_dirty: true,
            generation,
            parent_id,
            father_id: None,
            lineage_id,
            max_age,
            food_memory: FxHashMap::default(),
            water_memory: FxHashMap::default(),
            danger_memory: FxHashMap::default(),
            thought_history: VecDeque::new(),
            q_table: FxHashMap::default(),
            last_reproduced: 0,
            last_challenged: 0,
            lineage_attitudes: BTreeMap::new(),
            org_trust: BTreeMap::new(),
            traits,
            infection: 0.0,
            carrying: 0,
            carrying_type: 0,
            vocabulary: Vocabulary::from_hashmap(&rustc_hash::FxHashMap::default()),
            daily_story: String::new(),
            last_story_tick: 0,
            life_log: VecDeque::new(),
            discoveries: BTreeSet::new(),
            home_x: x,
            home_y: y,
            home_furniture: Vec::new(),
            home_style_seed: 0,
            is_elder: false,
            has_reflected: false,
            last_invention_tick: 0,
            last_experiment_tick: 0,
            directive: String::new(),
            directive_until: 0,
            last_think_tick: 0,
            last_think_by_kind: BTreeMap::new(),
            loneliness: 0.0,
            boredom: 0.0,
            fear_level: 0.0,
            comfort: 0.5,
            mood: 0.0,
            hope: 0.5,
            awe: 0.0,
            gratitude: 0.0,
            jealousy: 0.0,
            anger: 0.0,
            regret: 0.0,
            curiosity_drive: 0.0,
            spiritual: 0.0,
            grief_ticks: 0,
            joy_ticks: 0,
            aspiration: String::new(),
            orphaned_tick: 0,
            sleep_debt: 0.0,
            water_ticks: 0,
            last_harm: None,
            area_ticks: 0,
            last_area_cell: (x as i32, y as i32),
            wander_target: None,
            journey: None,
            route: Default::default(),
            last_groomed: 0,
            last_fed_kin: 0,
            last_ancestral_thought: 0,
            partner_id: None,
            children_count: 0,
            sex: Sex::Male,
            attracted_to: None,
            attraction_tick: 0,
            pregnant: false,
            pregnancy_start: 0,
            inv_water: 0,
            inv_food: 0,
            inv_wood: 0,
            inv_stone: 0,
            nursing_until: 0,
            wealth: 5,
            literacy: 0.0,
            schooling_ticks: 0,
            university_ticks: 0,
            piety: 0.0,
            specialty: None,
            religion_id: None,
            degrees: Vec::new(),
            tools: BTreeMap::new(),
            diseases: Vec::new(),
            disease_immunity: BTreeMap::new(),
            mounted_vehicle: None,
            is_leader: false,
            conversations: VecDeque::new(),
            friends: BTreeMap::new(),
            attributes: BTreeSet::new(),
            anchor_events: Vec::new(),
            memories: {
                let mut m = super::memory::MemoryStore::default();
                for entry in super::memory::seed_core_memories(0) {
                    m.insert(entry);
                }
                m
            },
            birth_tick: 0,
            zodiac: String::new(),
        }
    }
}
