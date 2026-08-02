use rustc_hash::FxHashMap;
use std::collections::{HashMap, HashSet};
use std::io;

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

use crate::organism::animal::{Animal, AnimalKind};
use crate::organism::organism::Organism;
use crate::physics::engine::PhysicsEngine;
use crate::sim::simulation::{Event, History, Simulation, StoryEntry, ThinkTrigger, SAVE_SCHEMA_VERSION};
use crate::sim::world_events::{DroughtState, WeatherState};
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::Tile;

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct GridSave {
    tiles: Vec<i8>,
    /// Biomes evolve after world generation through climate drift,
    /// deforestation, and restoration. Empty means a legacy save whose
    /// deterministic seed-generated biome map should be retained.
    biome: Vec<u8>,
    /// Water depth changes at runtime as droughts, floods, and completed
    /// infrastructure reshape the map, so it cannot be regenerated from the
    /// world seed on load.
    depth: Vec<f32>,
    fire: Vec<f32>,
    food_trail: Vec<f32>,
    water_trail: Vec<f32>,
    path_trail: Vec<f32>,
    structure: Vec<f32>,
    fertility: Vec<f32>,
    hazard: Vec<f32>,
    pressure: Vec<f32>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct DroughtSave {
    active: bool,
    start_tick: u64,
    dried_tiles: Vec<[i32; 2]>,
    rain_relief: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct WeatherSave {
    kind: u8,
    start_tick: u64,
    duration: u64,
    intensity: f32,
    #[serde(default)]
    wet_until: u64,
    wind_x: f32,
    wind_y: f32,
    wind_last_tick: u64,
}

impl Default for WeatherSave {
    fn default() -> Self {
        Self {
            kind: 0,
            start_tick: 0,
            duration: 0,
            intensity: 0.0,
            wet_until: 0,
            wind_x: 0.4,
            wind_y: 0.0,
            wind_last_tick: 0,
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct OrgSave {
    id: String,
    name: String,
    x: f32,
    y: f32,
    energy: f32,
    hydration: f32,
    health: f32,
    age: u32,
    alive: bool,
    thought: String,
    generation: u32,
    parent_id: String,
    lineage_id: String,
    max_age: u32,
    food_memory: HashMap<String, f32>,
    water_memory: HashMap<String, f32>,
    danger_memory: HashMap<String, f32>,
    thought_history: Vec<crate::organism::organism::ThoughtEntry>,
    q_table: FxHashMap<String, Vec<(u16, f32)>>,
    last_reproduced: u64,
    last_challenged: u64,
    water_ticks: u32,
    lineage_attitudes: HashMap<String, f32>,
    org_trust: HashMap<String, f32>,
    traits: crate::organism::traits::Traits,
    infection: f32,
    carrying: u32,
    carrying_type: u8,
    vocabulary: crate::organism::vocabulary::Vocabulary,
    daily_story: String,
    last_story_tick: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    life_log_legacy: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    life_log: Vec<crate::organism::organism::LifeEvent>,
    discoveries: Vec<String>,
    home_x: f32,
    home_y: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    home_furniture: Vec<String>,
    #[serde(default)]
    home_style_seed: u32,
    has_reflected: bool,
    last_invention_tick: u64,
    #[serde(default)]
    last_experiment_tick: u64,
    last_think_tick: u64,
    partner_id: Option<String>,
    children_count: u32,
    sex: String,
    attracted_to: Option<String>,
    attraction_tick: u64,
    pregnant: bool,
    pregnancy_start: u64,
    conversations: Vec<crate::organism::organism::ConversationEntry>,
    father_id: Option<String>,
    #[serde(default)]
    attributes: Vec<String>,
    // ── Emotional / cognitive state (previously dropped on save) ──────
    #[serde(default)]
    is_elder: bool,
    #[serde(default)]
    loneliness: f32,
    #[serde(default)]
    boredom: f32,
    #[serde(default)]
    fear_level: f32,
    #[serde(default)]
    comfort: f32,
    #[serde(default)]
    grief_ticks: u32,
    #[serde(default)]
    joy_ticks: u32,
    #[serde(default)]
    aspiration: String,
    #[serde(default)]
    orphaned_tick: u64,
    #[serde(default)]
    sleep_debt: f32,
    #[serde(default)]
    directive: String,
    #[serde(default)]
    directive_until: u64,
    #[serde(default)]
    last_groomed: u64,
    #[serde(default)]
    last_fed_kin: u64,
    #[serde(default)]
    last_ancestral_thought: u64,
    // ── Inventory (previously dropped) ────────────────────────────────
    #[serde(default)]
    inv_water: u8,
    #[serde(default)]
    inv_food: u8,
    #[serde(default)]
    inv_wood: u8,
    #[serde(default)]
    inv_stone: u8,
    // ── Friend network (previously dropped) ───────────────────────────
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    friends: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    former_friends: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    acquaintances: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    anchor_events: Vec<(u64, String, f32)>,
    #[serde(default)]
    memories: crate::organism::memory::MemoryStore,
    #[serde(default)]
    zodiac: String,
    #[serde(default)]
    birth_tick: u64,
    #[serde(default)]
    last_think_by_kind: HashMap<String, u64>,
    #[serde(default)]
    mood: f32,
    #[serde(default)]
    hope: f32,
    #[serde(default)]
    awe: f32,
    #[serde(default)]
    gratitude: f32,
    #[serde(default)]
    jealousy: f32,
    #[serde(default)]
    anger: f32,
    #[serde(default)]
    regret: f32,
    #[serde(default)]
    curiosity_drive: f32,
    #[serde(default)]
    spiritual: f32,
    #[serde(default)]
    area_ticks: u32,
    #[serde(default)]
    last_area_cell: [i32; 2],
    #[serde(default)]
    wander_target: Option<[i32; 2]>,
    #[serde(default)]
    nursing_until: u64,
    #[serde(default)]
    wealth: u32,
    #[serde(default)]
    literacy: f32,
    #[serde(default)]
    schooling_ticks: u32,
    #[serde(default)]
    university_ticks: u32,
    #[serde(default)]
    piety: f32,
    #[serde(default)]
    specialty: Option<String>,
    #[serde(default)]
    religion_id: Option<String>,
    #[serde(default)]
    degrees: Vec<String>,
    #[serde(default)]
    tools: HashMap<String, u8>,
    #[serde(default)]
    diseases: Vec<(String, u64)>,
    #[serde(default)]
    disease_immunity: HashMap<String, u64>,
    #[serde(default)]
    mounted_vehicle: Option<u32>,
    #[serde(default)]
    is_leader: bool,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct AnimalSave {
    id: usize,
    x: f32,
    y: f32,
    alive: bool,
    energy: f32,
    kind: u8,
    last_reproduced: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bonded_org: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct NegotiationSave {
    a: String,
    b: String,
    tick: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct WaterUseSave {
    x: i32,
    y: i32,
    count: u32,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SaveState {
    pub(crate) version: u32,
    pub(crate) tick_count: u64,
    next_animal_id: usize,
    history: History,
    drought: DroughtSave,
    weather: WeatherSave,
    events: Vec<Event>,
    pub(crate) organisms: Vec<OrgSave>,
    pub(crate) animals: Vec<AnimalSave>,
    pub(crate) grid: GridSave,
    story_history: Vec<StoryEntry>,
    pop_history: Vec<[u64; 2]>,
    lineage_centroid_history: HashMap<String, Vec<[i32; 3]>>,
    #[serde(default)]
    lineage_homes: HashMap<String, [i32; 3]>,
    #[serde(default)]
    lineage_eras: HashMap<String, super::era::Era>,
    current_era: String,
    sex_words: Vec<String>,
    pub(crate) world_seed: u64,
    lineage_names: HashMap<String, String>,
    lineage_strategies: HashMap<String, (String, u64)>,
    #[serde(default)]
    lineage_strategy_objectives: HashMap<String, super::simulation::StrategyObjective>,
    #[serde(default)]
    lineage_strategy_history: Vec<super::simulation::StrategyCampaignRecord>,
    lineage_last_council: HashMap<String, u64>,
    lineage_elders: HashMap<String, String>,
    lineage_negotiations: Vec<NegotiationSave>,
    pending_thinks: Vec<ThinkTrigger>,
    rng: Option<ChaCha8Rng>,
    flood_tiles: Vec<(i32, i32, u64)>,
    #[serde(default)]
    territory: HashMap<String, Vec<[i32; 2]>>,
    #[serde(default)]
    last_immigration_tick: u64,
    #[serde(default)]
    settlement_tiers: HashMap<String, u8>,
    #[serde(default)]
    buildings: Vec<super::buildings::Building>,
    #[serde(default)]
    next_building_id: u32,
    #[serde(default)]
    governments: HashMap<String, super::government::Government>,
    #[serde(default)]
    religions: Vec<super::culture::Religion>,
    #[serde(default)]
    next_religion_id: u32,
    #[serde(default)]
    artworks: Vec<super::culture::Artwork>,
    #[serde(default)]
    next_artwork_id: u32,
    #[serde(default)]
    festivals: Vec<super::culture::Festival>,
    #[serde(default)]
    next_festival_id: u32,
    #[serde(default)]
    last_witness_tick: u64,
    #[serde(default)]
    books: Vec<super::language_tech::Book>,
    #[serde(default)]
    next_book_id: u32,
    #[serde(default)]
    farms: Vec<super::agriculture::Farm>,
    #[serde(default)]
    next_farm_id: u32,
    #[serde(default)]
    vehicles: Vec<super::transportation::Vehicle>,
    #[serde(default)]
    next_vehicle_id: u32,
    #[serde(default)]
    battles: Vec<super::warfare::Battle>,
    #[serde(default)]
    next_battle_id: u32,
    #[serde(default)]
    treaties: Vec<super::warfare::Treaty>,
    #[serde(default)]
    outbreaks: Vec<super::medicine::Outbreak>,
    #[serde(default)]
    milestones_achieved: HashSet<String>,
    #[serde(default)]
    lineage_peak_pop: HashMap<String, u32>,
    #[serde(default)]
    headlines: Vec<(u64, String)>,
    #[serde(default)]
    trades: Vec<super::economy::Trade>,
    #[serde(default)]
    trade_routes: Vec<super::civ::trade_routes::TradeRoute>,
    #[serde(default)]
    caravans: Vec<super::civ::trade_routes::Caravan>,
    #[serde(default)]
    supply_caches: Vec<super::survival_resources::SupplyCache>,
    #[serde(default)]
    next_trade_route_id: u32,
    #[serde(default)]
    next_caravan_id: u32,
    #[serde(default)]
    water_use: Vec<WaterUseSave>,
    #[serde(default)]
    field_fortifications: Vec<super::warfare::FieldFortification>,
}

fn mem_encode(m: &FxHashMap<(i32, i32), f32>) -> HashMap<String, f32> {
    m.iter()
        .map(|(&(x, y), &v)| (format!("{},{}", x, y), v))
        .collect()
}

fn mem_decode(m: HashMap<String, f32>) -> FxHashMap<(i32, i32), f32> {
    m.into_iter()
        .filter_map(|(k, v)| {
            let mut parts = k.splitn(2, ',');
            let x = parts.next()?.parse::<i32>().ok()?;
            let y = parts.next()?.parse::<i32>().ok()?;
            Some(((x, y), v))
        })
        .collect()
}

/// Saved `next_*_id` fields are advisory when loading older or hand-imported
/// worlds. Several of those fields were added after their entity collections,
/// so serde legitimately defaults them to zero. Always advance past every
/// persisted numeric ID before the simulation is allowed to create more
/// entities.
fn repaired_next_u32_id(saved_next: u32, ids: impl Iterator<Item = u32>) -> u32 {
    ids.fold(saved_next.max(1), |next, id| next.max(id.saturating_add(1)))
}

fn repaired_next_animal_id(saved_next: usize, animals: &[AnimalSave]) -> usize {
    animals
        .iter()
        .fold(saved_next, |next, animal| next.max(animal.id.saturating_add(1)))
}

fn repaired_next_religion_id(saved_next: u32, religions: &[super::culture::Religion]) -> u32 {
    repaired_next_u32_id(
        saved_next,
        religions.iter().filter_map(|religion| {
            religion
                .id
                .strip_prefix("rel")
                .and_then(|suffix| suffix.parse::<u32>().ok())
        }),
    )
}

fn repaired_next_sequence(saved_next: u32, persisted_count: usize) -> u32 {
    saved_next.max(
        u32::try_from(persisted_count)
            .unwrap_or(u32::MAX)
            .saturating_add(1),
    )
}

fn org_to_save(o: &Organism) -> OrgSave {
    OrgSave {
        id: o.id.clone(),
        name: o.name.clone(),
        x: o.x,
        y: o.y,
        energy: o.energy,
        hydration: o.hydration,
        health: o.health,
        age: o.age,
        alive: o.alive,
        thought: o.thought.clone(),
        generation: o.generation,
        parent_id: o.parent_id.clone(),
        lineage_id: o.lineage_id.clone(),
        max_age: o.max_age,
        food_memory: mem_encode(&o.food_memory),
        water_memory: mem_encode(&o.water_memory),
        danger_memory: mem_encode(&o.danger_memory),
        thought_history: o.thought_history.iter().cloned().collect(),
        q_table: o.q_table.clone(),
        last_reproduced: o.last_reproduced,
        last_challenged: o.last_challenged,
        water_ticks: o.water_ticks,
        lineage_attitudes: o.lineage_attitudes.clone(),
        org_trust: o.org_trust.clone(),
        traits: o.traits.clone(),
        infection: o.infection,
        carrying: o.carrying,
        carrying_type: o.carrying_type,
        vocabulary: o.vocabulary.clone(),
        daily_story: o.daily_story.clone(),
        last_story_tick: o.last_story_tick,
        life_log_legacy: Vec::new(),
        life_log: o.life_log.iter().cloned().collect(),
        discoveries: o.discoveries.iter().cloned().collect(),
        home_x: o.home_x,
        home_y: o.home_y,
        home_furniture: o.home_furniture.clone(),
        home_style_seed: o.home_style_seed,
        has_reflected: o.has_reflected,
        last_invention_tick: o.last_invention_tick,
        last_experiment_tick: o.last_experiment_tick,
        last_think_tick: o.last_think_tick,
        partner_id: o.partner_id.clone(),
        children_count: o.children_count,
        sex: o.sex.as_str().to_string(),
        attracted_to: o.attracted_to.clone(),
        attraction_tick: o.attraction_tick,
        pregnant: o.pregnant,
        pregnancy_start: o.pregnancy_start,
        conversations: o.conversations.iter().cloned().collect(),
        father_id: o.father_id.clone(),
        attributes: o.attributes.iter().cloned().collect(),
        is_elder: o.is_elder,
        loneliness: o.loneliness,
        boredom: o.boredom,
        fear_level: o.fear_level,
        comfort: o.comfort,
        grief_ticks: o.grief_ticks,
        joy_ticks: o.joy_ticks,
        aspiration: o.aspiration.clone(),
        orphaned_tick: o.orphaned_tick,
        sleep_debt: o.sleep_debt,
        directive: o.directive.clone(),
        directive_until: o.directive_until,
        last_groomed: o.last_groomed,
        last_fed_kin: o.last_fed_kin,
        last_ancestral_thought: o.last_ancestral_thought,
        inv_water: o.inv_water,
        inv_food: o.inv_food,
        inv_wood: o.inv_wood,
        inv_stone: o.inv_stone,
        friends: o.friends.clone(),
        former_friends: o.former_friends.clone(),
        acquaintances: o.acquaintances.iter().cloned().collect(),
        anchor_events: o.anchor_events.clone(),
        memories: o.memories.clone(),
        zodiac: o.zodiac.clone(),
        birth_tick: o.birth_tick,
        last_think_by_kind: o.last_think_by_kind.clone(),
        mood: o.mood,
        hope: o.hope,
        awe: o.awe,
        gratitude: o.gratitude,
        jealousy: o.jealousy,
        anger: o.anger,
        regret: o.regret,
        curiosity_drive: o.curiosity_drive,
        spiritual: o.spiritual,
        area_ticks: o.area_ticks,
        last_area_cell: [o.last_area_cell.0, o.last_area_cell.1],
        wander_target: o.wander_target.map(|(x, y)| [x, y]),
        nursing_until: o.nursing_until,
        wealth: o.wealth,
        literacy: o.literacy,
        schooling_ticks: o.schooling_ticks,
        university_ticks: o.university_ticks,
        piety: o.piety,
        specialty: o.specialty.clone(),
        religion_id: o.religion_id.clone(),
        degrees: o.degrees.clone(),
        tools: o.tools.clone(),
        diseases: o.diseases.clone(),
        disease_immunity: o.disease_immunity.clone(),
        mounted_vehicle: o.mounted_vehicle,
        is_leader: o.is_leader,
    }
}

fn org_from_save(s: OrgSave, save_version: u32) -> Organism {
    let vocab_seed = {
        let lid_seed = s
            .lineage_id
            .bytes()
            .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let id_seed = s.id.bytes().fold(0u64, |a, b| a.wrapping_add(b as u64));
        lid_seed ^ id_seed
    };
    let needs_vocab = s.vocabulary.is_empty();
    let saved_vocab = s.vocabulary;
    let mut o = Organism::new(
        s.id,
        s.name,
        s.x,
        s.y,
        s.generation,
        s.parent_id,
        s.lineage_id,
        s.max_age,
        s.traits,
    );
    o.energy = s.energy;
    o.hydration = s.hydration;
    o.health = s.health;
    o.age = s.age;
    o.alive = s.alive;
    o.thought = s.thought;
    o.food_memory = mem_decode(s.food_memory);
    o.water_memory = mem_decode(s.water_memory);
    o.danger_memory = mem_decode(s.danger_memory);
    o.thought_history = s.thought_history.into_iter().collect();
    o.q_table = s.q_table;
    o.last_reproduced = s.last_reproduced;
    o.last_challenged = s.last_challenged;
    o.water_ticks = s.water_ticks;
    o.lineage_attitudes = s.lineage_attitudes;
    o.org_trust = s.org_trust;
    o.infection = s.infection;
    o.carrying = s.carrying;
    o.carrying_type = s.carrying_type;
    o.daily_story = s.daily_story;
    o.last_story_tick = s.last_story_tick;
    // Prefer the structured LifeEvent log; fall back to legacy string
    // log only if no structured entries exist (handles pre-LifeEvent
    // saves without losing the history).
    o.life_log = if !s.life_log.is_empty() {
        s.life_log.into_iter().collect()
    } else {
        s.life_log_legacy
            .into_iter()
            .map(|t| crate::organism::organism::LifeEvent {
                tick: 0,
                category: "event".to_string(),
                text: t,
                related_id: None,
                related_name: None,
            })
            .collect()
    };
    o.acquaintances = s.acquaintances.into_iter().collect();
    // Upgrade saves created before durable acquaintances existed while their
    // structured introduction records are still available.
    o.acquaintances.extend(o.life_log.iter().filter_map(|entry| {
        (entry.category == "introduction")
            .then(|| entry.related_id.clone())
            .flatten()
    }));
    o.discoveries = s.discoveries.into_iter().collect();
    if s.home_x != 0.0 || s.home_y != 0.0 {
        o.home_x = s.home_x;
        o.home_y = s.home_y;
    }
    o.home_furniture = s.home_furniture;
    o.home_style_seed = s.home_style_seed;
    o.has_reflected = s.has_reflected;
    o.last_invention_tick = s.last_invention_tick;
    o.last_experiment_tick = s.last_experiment_tick;
    o.last_think_tick = s.last_think_tick;
    o.partner_id = s.partner_id;
    o.children_count = s.children_count;
    o.sex = crate::organism::organism::Sex::from_str(&s.sex);
    o.attracted_to = s.attracted_to;
    o.attraction_tick = s.attraction_tick;
    o.pregnant = s.pregnant;
    o.pregnancy_start = s.pregnancy_start;
    o.conversations = s.conversations.into_iter().collect();
    o.father_id = s.father_id;
    o.attributes = s.attributes.into_iter().collect();
    o.is_elder = s.is_elder;
    o.loneliness = s.loneliness;
    o.boredom = s.boredom;
    o.fear_level = s.fear_level;
    o.comfort = s.comfort;
    o.grief_ticks = s.grief_ticks;
    o.joy_ticks = s.joy_ticks;
    o.aspiration = s.aspiration;
    o.orphaned_tick = s.orphaned_tick;
    o.sleep_debt = s.sleep_debt;
    o.directive = s.directive;
    o.directive_until = s.directive_until;
    o.last_groomed = s.last_groomed;
    o.last_fed_kin = s.last_fed_kin;
    o.last_ancestral_thought = s.last_ancestral_thought;
    o.inv_water = s.inv_water;
    o.inv_food = s.inv_food;
    o.inv_wood = s.inv_wood;
    o.inv_stone = s.inv_stone;
    o.friends = s.friends;
    o.former_friends = s.former_friends;
    o.acquaintances.extend(o.friends.keys().cloned());
    o.acquaintances.extend(o.former_friends.keys().cloned());
    o.anchor_events = s.anchor_events;
    if !s.memories.entries.is_empty() {
        o.memories = s.memories;
    }
    if !s.zodiac.is_empty() {
        o.zodiac = s.zodiac;
    }
    if s.birth_tick > 0 {
        o.birth_tick = s.birth_tick;
    }
    if save_version >= 4 {
        o.last_think_by_kind = s.last_think_by_kind;
        o.mood = s.mood;
        o.hope = s.hope;
        o.awe = s.awe;
        o.gratitude = s.gratitude;
        o.jealousy = s.jealousy;
        o.anger = s.anger;
        o.regret = s.regret;
        o.curiosity_drive = s.curiosity_drive;
        o.spiritual = s.spiritual;
        o.area_ticks = s.area_ticks;
        o.last_area_cell = (s.last_area_cell[0], s.last_area_cell[1]);
        o.wander_target = s.wander_target.map(|[x, y]| (x, y));
        o.nursing_until = s.nursing_until;
        o.wealth = s.wealth;
        o.literacy = s.literacy;
        o.schooling_ticks = s.schooling_ticks;
        o.university_ticks = s.university_ticks;
        o.piety = s.piety;
        o.specialty = s.specialty;
        o.religion_id = s.religion_id;
        o.degrees = s.degrees;
        o.tools = s.tools;
        o.diseases = s.diseases;
        o.disease_immunity = s.disease_immunity;
        o.mounted_vehicle = s.mounted_vehicle;
        o.is_leader = s.is_leader;
    }
    if needs_vocab {
        let mut voc_rng = rand_chacha::ChaCha8Rng::seed_from_u64(vocab_seed);
        o.vocabulary = crate::organism::vocabulary::Vocabulary::generate(&mut voc_rng);
    } else {
        o.vocabulary = saved_vocab;
    }
    o
}

fn animal_to_save(a: &Animal) -> AnimalSave {
    let kind = match a.kind {
        AnimalKind::Rabbit => 0,
        AnimalKind::Deer => 1,
        AnimalKind::Boar => 2,
        AnimalKind::Bird => 3,
        AnimalKind::Fish => 4,
        AnimalKind::Wolf => 5,
        AnimalKind::Dog => 6,
    };
    AnimalSave {
        id: a.id,
        x: a.x,
        y: a.y,
        alive: a.alive,
        energy: a.energy,
        kind,
        last_reproduced: a.last_reproduced,
        name: a.name.clone(),
        bonded_org: a.bonded_org.clone(),
    }
}

fn animal_from_save(s: AnimalSave) -> Animal {
    let kind = match s.kind {
        0 => AnimalKind::Rabbit,
        1 => AnimalKind::Deer,
        2 => AnimalKind::Boar,
        3 => AnimalKind::Bird,
        4 => AnimalKind::Fish,
        5 => AnimalKind::Wolf,
        6 => AnimalKind::Dog,
        _ => AnimalKind::Rabbit,
    };
    let mut a = Animal::new(s.id, s.x, s.y, kind);
    a.alive = s.alive;
    a.energy = s.energy;
    a.last_reproduced = s.last_reproduced;
    a.name = s.name;
    a.bonded_org = s.bonded_org;
    a
}

impl Simulation {
    pub fn save(&self, path: &str) {
        if let Err(e) = self.save_result(path) {
            tracing::warn!(target: "save", "failed to write {}: {}", path, e);
        }
    }

    pub fn save_result(&self, path: &str) -> io::Result<()> {
        let state = self.to_save_state();
        write_save_to_disk(&state, path)
    }

    /// Builds the in-memory SaveState snapshot. Cheap-ish (mostly
    /// Vec/HashMap clones); no fs IO, no serialization. Call this
    /// while you hold the sim lock, then pass the result to
    /// `write_save_to_disk` on a background blocking task so the
    /// next tick can run while serde_json + fs::write happen.
    pub fn to_save_state(&self) -> SaveState {
        SaveState {
            version: SAVE_SCHEMA_VERSION,
            tick_count: self.tick_count,
            next_animal_id: self.next_animal_id,
            history: self.history.clone(),
            drought: DroughtSave {
                active: self.drought.active,
                start_tick: self.drought.start_tick,
                dried_tiles: self.drought.dried_tiles.iter().map(|&(x, y)| [x, y]).collect(),
                rain_relief: self.drought.rain_relief,
            },
            weather: WeatherSave {
                kind: self.weather.kind,
                start_tick: self.weather.start_tick,
                duration: self.weather.duration,
                intensity: self.weather.intensity,
                wet_until: self.weather.wet_until,
                wind_x: self.weather.wind_x,
                wind_y: self.weather.wind_y,
                wind_last_tick: self.weather.wind_last_tick,
            },
            // Cap unbounded VecDeques on save. Their in-memory caps
            // are larger than what makes sense to persist; if we ship
            // them whole, save bloats linearly with playtime and the
            // serde_json::to_string allocation eats the spawn_blocking
            // budget. The tail is what subsequent reads actually need.
            pop_history: self.pop_history.iter().rev().take(300).rev().cloned().collect(),
            lineage_centroid_history: self
                .lineage_centroid_history
                .iter()
                .map(|(k, v)| (k.clone(), v.iter().rev().take(60).rev().cloned().collect()))
                .collect(),
            lineage_homes: self.lineage_homes.clone(),
            lineage_eras: self.lineage_eras.clone(),
            events: self.events.iter().rev().take(200).rev().cloned().collect(),
            organisms: self.organisms.iter().map(org_to_save).collect(),
            animals: self.animals.iter().map(animal_to_save).collect(),
            story_history: self.story_history.iter().rev().take(120).rev().cloned().collect(),
            grid: GridSave {
                tiles: self.grid.tiles.clone(),
                biome: self.grid.biome.clone(),
                depth: self.grid.depth.clone(),
                fire: self.grid.fire_intensity.clone(),
                food_trail: self.grid.food_trail.clone(),
                water_trail: self.grid.water_trail.clone(),
                path_trail: self.grid.path_trail.clone(),
                structure: self.grid.structure.clone(),
                fertility: self.grid.fertility.clone(),
                hazard: self.grid.hazard.clone(),
                pressure: self.grid.pressure.clone(),
            },
            current_era: self.current_era.clone(),
            sex_words: self.sex_words.to_vec(),
            world_seed: self.world_seed,
            lineage_names: self.lineage_names.clone(),
            lineage_strategies: self.lineage_strategies.clone(),
            lineage_strategy_objectives: self.lineage_strategy_objectives.clone(),
            lineage_strategy_history: self
                .lineage_strategy_history
                .iter()
                .rev()
                .take(40)
                .rev()
                .cloned()
                .collect(),
            lineage_last_council: self.lineage_last_council.clone(),
            lineage_elders: self.lineage_elders.clone(),
            lineage_negotiations: self
                .lineage_negotiations
                .iter()
                .map(|((a, b), &tick)| NegotiationSave {
                    a: a.clone(),
                    b: b.clone(),
                    tick,
                })
                .collect(),
            pending_thinks: self.pending_thinks.clone(),
            rng: Some(self.rng.clone()),
            flood_tiles: self.flood_tiles.clone(),
            territory: self
                .territory
                .iter()
                .map(|(lid, tiles)| (lid.clone(), tiles.iter().map(|&(x, y)| [x, y]).collect()))
                .collect(),
            last_immigration_tick: self.last_immigration_tick,
            settlement_tiers: self.settlement_tiers.clone(),
            buildings: self.buildings.clone(),
            next_building_id: self.next_building_id,
            governments: self.governments.clone(),
            religions: self.religions.clone(),
            next_religion_id: self.next_religion_id,
            artworks: self.artworks.clone(),
            next_artwork_id: self.next_artwork_id,
            festivals: self.festivals.clone(),
            next_festival_id: self.next_festival_id,
            last_witness_tick: self.last_witness_tick,
            books: self.books.clone(),
            next_book_id: self.next_book_id,
            farms: self.farms.clone(),
            next_farm_id: self.next_farm_id,
            vehicles: self.vehicles.clone(),
            next_vehicle_id: self.next_vehicle_id,
            battles: self.battles.clone(),
            next_battle_id: self.next_battle_id,
            treaties: self.treaties.clone(),
            outbreaks: self.outbreaks.clone(),
            milestones_achieved: self.milestones_achieved.clone(),
            lineage_peak_pop: self.lineage_peak_pop.clone(),
            headlines: self.headlines.iter().rev().take(160).rev().cloned().collect(),
            trades: self.trades.iter().rev().take(500).rev().cloned().collect(),
            trade_routes: self.trade_routes.clone(),
            caravans: self.caravans.clone(),
            supply_caches: self.supply_caches.clone(),
            next_trade_route_id: self.next_trade_route_id,
            next_caravan_id: self.next_caravan_id,
            water_use: self
                .water_use
                .iter()
                .map(|(&(x, y), &count)| WaterUseSave { x, y, count })
                .collect(),
            field_fortifications: self.field_fortifications.clone(),
        }
    }
}

/// Standalone IO so it can be called from a blocking task off the
/// main runtime. Atomic rename + parent-dir fsync mirror the
/// previous in-line behaviour.
pub fn write_save_to_disk(state: &SaveState, path: &str) -> io::Result<()> {
    let json = serde_json::to_string(state).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let tmp_path = format!("{}.tmp", path);
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp_path)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    if let Some(parent) = std::path::Path::new(path).parent() {
        let dir = if parent.as_os_str().is_empty() {
            std::path::Path::new(".")
        } else {
            parent
        };
        if let Ok(d) = std::fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

impl Simulation {
    pub fn load_or_new(seed: u64, path: &str) -> Self {
        match std::fs::read_to_string(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::info!("No save at {} - starting fresh world", path);
                Self::new(seed)
            }
            Err(e) => {
                tracing::warn!("Save at {} unreadable ({}) - starting fresh world", path, e);
                Self::new(seed)
            }
            Ok(data) => match serde_json::from_str::<SaveState>(&data) {
                Ok(state) => {
                    if state.version != 0 && state.version > SAVE_SCHEMA_VERSION {
                        // Newer schema than this binary supports - back up and
                        // start fresh rather than silently filling with defaults.
                        let backup = format!("{}.future-v{}", path, state.version);
                        let _ = std::fs::rename(path, &backup);
                        tracing::warn!(
                            "Save at {} is schema v{} but this binary only supports v{}. \
                             Backed up to {} and starting fresh world.",
                            path,
                            state.version,
                            SAVE_SCHEMA_VERSION,
                            backup
                        );
                        return Self::new(seed);
                    }
                    if state.version != 0 && state.version < SAVE_SCHEMA_VERSION {
                        tracing::info!(
                            "Loaded world from {} (tick {}, migrating schema v{} → v{})",
                            path,
                            state.tick_count,
                            state.version,
                            SAVE_SCHEMA_VERSION
                        );
                    } else {
                        tracing::info!("Loaded world from {} (tick {})", path, state.tick_count);
                    }
                    let terrain_seed = if state.world_seed > 0 {
                        state.world_seed
                    } else {
                        seed
                    };
                    Self::from_save(terrain_seed, state)
                }
                Err(e) => {
                    // Don't overwrite a possibly-recoverable save on the next
                    // `save()`. Back it up with a timestamp so the operator
                    // can inspect it.
                    use std::time::{SystemTime, UNIX_EPOCH};
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let backup = format!("{}.corrupt-{}", path, ts);
                    if let Err(re) = std::fs::rename(path, &backup) {
                        tracing::warn!("Failed to back up corrupt save to {}: {}", backup, re);
                    } else {
                        tracing::warn!("Backed up corrupt save to {}", backup);
                    }
                    tracing::warn!(
                        "Save at {} could not be deserialized ({}) - starting fresh world.",
                        path,
                        e
                    );
                    Self::new(seed)
                }
            },
        }
    }

    pub fn from_save(seed: u64, state: SaveState) -> Self {
        let expected = WIDTH * HEIGHT;
        let mut grid = WorldGrid::new(seed);
        if state.grid.tiles.len() == expected {
            grid.tiles = state.grid.tiles;
            if state.grid.biome.len() == expected {
                grid.biome = state.grid.biome;
            }
            if state.grid.depth.len() == expected {
                grid.depth = state.grid.depth;
            }
            if state.grid.fire.len() == expected {
                grid.fire_intensity = state.grid.fire;
            }
            if state.grid.food_trail.len() == expected {
                grid.food_trail = state.grid.food_trail;
            }
            if state.grid.water_trail.len() == expected {
                grid.water_trail = state.grid.water_trail;
            }
            if state.grid.path_trail.len() == expected {
                grid.path_trail = state.grid.path_trail;
            }
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
            grid.trail_dirty = (0..expected)
                .filter(|&i| {
                    grid.food_trail[i] > 0.0 || grid.water_trail[i] > 0.0 || grid.path_trail[i] > 0.0
                })
                .map(|i| i as u32)
                .collect();
        } else {
            tracing::info!(
                "Save grid size mismatch (got {}, need {}) - regenerating world",
                state.grid.tiles.len(),
                expected
            );
        }

        let drought = DroughtState {
            active: state.drought.active,
            start_tick: state.drought.start_tick,
            dried_tiles: state
                .drought
                .dried_tiles
                .into_iter()
                .map(|[x, y]| (x, y))
                .collect(),
            rain_relief: state.drought.rain_relief,
        };

        let tick = state.tick_count;
        let save_version = state.version;
        let is_legacy_save = state.rng.is_none();
        let mut organisms: Vec<_> = state
            .organisms
            .into_iter()
            .map(|saved| org_from_save(saved, save_version))
            .collect();
        {
            use rand::RngExt;
            let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(seed ^ tick ^ 0xdeadbeef);
            for org in &mut organisms {
                if is_legacy_save {
                    if tick.saturating_sub(org.last_think_tick) >= 4000 {
                        org.last_think_tick = tick - rng.random_range(0..4000);
                    }
                    if tick.saturating_sub(org.last_invention_tick) >= 5000 {
                        org.last_invention_tick = tick - rng.random_range(0..5000);
                    }
                }
                org.x = org.x.clamp(1.0, WIDTH as f32 - 2.0);
                org.y = org.y.clamp(1.0, HEIGHT as f32 - 2.0);
            }
        }

        let active_structure_tiles: HashSet<(i32, i32)> = {
            let mut hs = HashSet::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    if grid.structure_at(x, y) > 0.0 {
                        hs.insert((x, y));
                    }
                }
            }
            hs
        };
        let field_fortifications = state
            .field_fortifications
            .into_iter()
            .filter(|fortification| grid.structure_at(fortification.x, fortification.y) > 0.0)
            .collect();
        let mut physics = PhysicsEngine::new();
        // Simulation physics runs exactly once every five world ticks.
        // Reconstruct its cadence so trail decay and lightning continue from
        // the same phase instead of restarting after every load.
        physics.tick_count = state.tick_count / 5;
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if matches!(grid.get(x, y), Tile::Fire | Tile::Campfire) {
                    physics.register_fire(x, y);
                }
            }
        }

        let next_animal_id = repaired_next_animal_id(state.next_animal_id, &state.animals);
        let mut buildings = state.buildings;
        let next_building_id = repaired_next_u32_id(state.next_building_id, buildings.iter().map(|b| b.id));
        for building in &mut buildings {
            if building.damage_fraction() >= 1.0 && building.ruined_at_tick.is_none() {
                building.ruined_at_tick = Some(building.last_damage_tick.unwrap_or(state.tick_count));
            }
        }
        let mut religions = state.religions;
        super::actions::religion_expanded::repair_persisted_religions(&mut organisms, &mut religions);
        let next_religion_id = repaired_next_religion_id(state.next_religion_id, &religions);
        let next_artwork_id =
            repaired_next_u32_id(state.next_artwork_id, state.artworks.iter().map(|a| a.id));
        let next_festival_id =
            repaired_next_u32_id(state.next_festival_id, state.festivals.iter().map(|f| f.id));
        let next_book_id = repaired_next_u32_id(state.next_book_id, state.books.iter().map(|b| b.id));
        let next_farm_id = repaired_next_u32_id(state.next_farm_id, state.farms.iter().map(|f| f.id));
        let mut farms = state.farms;
        super::agriculture::deduplicate_farm_plots(&mut farms);
        let next_vehicle_id =
            repaired_next_u32_id(state.next_vehicle_id, state.vehicles.iter().map(|v| v.id));
        // Battle IDs currently encode tick and lineages rather than this
        // sequence, but preserve a useful monotonic counter for old saves and
        // the eventual numeric-ID migration instead of resetting it to one.
        let next_battle_id = repaired_next_sequence(state.next_battle_id, state.battles.len());
        let mut treaties = state.treaties;
        super::warfare::consolidate_treaties(&mut treaties, state.tick_count);
        let next_trade_route_id = repaired_next_u32_id(
            state.next_trade_route_id,
            state.trade_routes.iter().map(|route| route.id),
        );
        let next_caravan_id = repaired_next_u32_id(
            state.next_caravan_id,
            state.caravans.iter().map(|caravan| caravan.id),
        );
        let mut supply_caches = state.supply_caches;
        super::survival_resources::repair_supply_caches(&mut supply_caches);

        let mut sim = Simulation {
            grid,
            physics,
            organisms,
            animals: state.animals.into_iter().map(animal_from_save).collect(),
            tick_count: state.tick_count,
            population_limit: super::config::DEFAULT_MAX_POPULATION,
            events: state.events.into_iter().collect(),
            history: state.history,
            drought,
            weather: WeatherState {
                kind: state.weather.kind,
                start_tick: state.weather.start_tick,
                duration: state.weather.duration,
                intensity: state.weather.intensity,
                wet_until: state.weather.wet_until,
                wind_x: state.weather.wind_x,
                wind_y: state.weather.wind_y,
                wind_last_tick: state.weather.wind_last_tick,
            },
            flood_tiles: state.flood_tiles,
            story_history: state.story_history.into_iter().collect(),
            pending_thinks: state.pending_thinks,
            pending_convos: Vec::new(),
            pending_memory_flushes: Vec::new(),
            lineage_strategies: state.lineage_strategies,
            lineage_strategy_objectives: state.lineage_strategy_objectives,
            lineage_strategy_history: state.lineage_strategy_history.into_iter().collect(),
            lineage_last_council: state.lineage_last_council,
            lineage_elders: state.lineage_elders,
            lineage_negotiations: state
                .lineage_negotiations
                .into_iter()
                .map(|n| {
                    let key = if n.a < n.b { (n.a, n.b) } else { (n.b, n.a) };
                    (key, n.tick)
                })
                .collect(),
            pop_history: state.pop_history.into_iter().collect(),
            lineage_centroid_history: state
                .lineage_centroid_history
                .into_iter()
                .map(|(k, v)| (k, v.into_iter().collect()))
                .collect(),
            lineage_homes: state.lineage_homes,
            lineage_eras: state.lineage_eras,
            lineage_aggregates: HashMap::new(),
            current_era: if state.current_era.is_empty() {
                "genesis".to_string()
            } else {
                state.current_era
            },
            sex_words: {
                if state.sex_words.len() >= 2 {
                    [state.sex_words[0].clone(), state.sex_words[1].clone()]
                } else {
                    use crate::organism::vocabulary::gen_phoneme_word;
                    let mut word_rng = rand_chacha::ChaCha8Rng::seed_from_u64(seed.wrapping_add(0xc0ffee));
                    let w0 = gen_phoneme_word(&mut word_rng);
                    let mut w1 = gen_phoneme_word(&mut word_rng);
                    while w1 == w0 {
                        w1 = gen_phoneme_word(&mut word_rng);
                    }
                    [w0, w1]
                }
            },
            world_seed: seed,
            next_animal_id,
            lineage_names: state.lineage_names,
            rng: state
                .rng
                .unwrap_or_else(|| ChaCha8Rng::seed_from_u64(seed ^ state.tick_count)),
            last_immigration_tick: state.last_immigration_tick,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes: serde_json::Value::Array(vec![]),
            slow_compute_tick: 0,
            active_structure_tiles,
            field_fortifications,
            settlement_tiers: state.settlement_tiers,
            territory: state
                .territory
                .into_iter()
                .map(|(lid, tiles)| (lid, tiles.into_iter().map(|[x, y]| (x, y)).collect()))
                .collect(),
            tile_owner: std::collections::HashMap::new(),
            cached_territory: serde_json::Value::Null,
            building_state_revision: 1,
            serialized_building_state_revision: 0,
            supply_cache_state_revision: 1,
            serialized_supply_cache_state_revision: 0,
            buildings,
            next_building_id,
            governments: state.governments,
            religions,
            next_religion_id,
            artworks: state.artworks,
            next_artwork_id,
            festivals: state.festivals,
            next_festival_id,
            action_counts: HashMap::new(),
            decision_counts: HashMap::new(),
            workshop_hits: HashMap::new(),
            last_witness_tick: state.last_witness_tick,
            books: state.books,
            next_book_id,
            farms,
            next_farm_id,
            vehicles: state.vehicles,
            next_vehicle_id,
            battles: state.battles,
            next_battle_id,
            treaties,
            outbreaks: state.outbreaks,
            milestones_achieved: state.milestones_achieved,
            lineage_peak_pop: state.lineage_peak_pop,
            headlines: state.headlines.into_iter().collect(),
            trades: state.trades.into_iter().collect(),
            trade_routes: state.trade_routes,
            caravans: state.caravans,
            supply_caches,
            next_trade_route_id,
            next_caravan_id,
            water_use: state
                .water_use
                .into_iter()
                .map(|entry| ((entry.x, entry.y), entry.count))
                .collect(),
        };
        // The save format only stores the forward map; rebuild the
        // inverse map after the struct exists. Last claim in the
        // iteration order wins (matches runtime "most recent wins"
        // semantics - order is unstable but the next claim_territory
        // call refreshes it deterministically).
        {
            let mut owner = std::collections::HashMap::new();
            for (lid, tiles) in sim.territory.iter() {
                for &p in tiles {
                    owner.insert(p, lid.clone());
                }
            }
            sim.tile_owner = owner;
        }
        sim.grid.enforce_ocean_border();
        sim.relocate_edge_squatters();
        // Strategy guidance existed before campaign objectives. Upgrade active
        // legacy guidance in-place so an imported local world immediately
        // gains a real target instead of displaying 0/0 forever.
        let living_lineages: std::collections::HashSet<String> = sim
            .organisms
            .iter()
            .filter(|organism| organism.alive || super::agents::growth::is_pending_birth(organism))
            .map(|organism| organism.lineage_id.clone())
            .collect();
        let loaded_tick = sim.tick_count;
        sim.lineage_strategies
            .retain(|lineage_id, (strategy, expires_tick)| {
                matches!(
                    strategy.as_str(),
                    "hunt" | "explore" | "settle" | "trade" | "defend"
                ) && *expires_tick > loaded_tick
                    && living_lineages.contains(lineage_id)
            });
        let legacy_objectives: Vec<(String, String, u64)> = sim
            .lineage_strategies
            .iter()
            .filter(|(lineage_id, (strategy, _))| {
                sim.lineage_strategy_objectives
                    .get(*lineage_id)
                    .is_none_or(|objective| objective.strategy != strategy.as_str() || objective.target == 0)
            })
            .map(|(lineage_id, (strategy, expires_tick))| {
                (lineage_id.clone(), strategy.clone(), *expires_tick)
            })
            .collect();
        for (lineage_id, objective) in sim.lineage_strategy_objectives.iter_mut() {
            objective.target = objective.target.max(1);
            objective.progress = objective.progress.min(objective.target);
            if objective.completed_tick.is_some() && objective.failed_tick.is_some() {
                if objective.completed_tick <= objective.failed_tick {
                    objective.failed_tick = None;
                } else {
                    objective.completed_tick = None;
                }
            }
            if let Some((strategy, expires_tick)) = sim.lineage_strategies.get(lineage_id) {
                if objective.strategy == *strategy && objective.target > 0 {
                    objective.expires_tick = *expires_tick;
                }
            }
        }
        // Older saves could retain a completed/failed objective and its
        // lineage directive until the original deadline. Terminal campaigns
        // already live in history, so repair them to the same idle state the
        // current runtime now produces.
        let terminal_guidance: Vec<(String, String)> = sim
            .lineage_strategy_objectives
            .iter()
            .filter(|(_, objective)| objective.completed_tick.is_some() || objective.failed_tick.is_some())
            .map(|(lineage_id, objective)| (lineage_id.clone(), objective.strategy.clone()))
            .collect();
        for (lineage_id, strategy) in terminal_guidance {
            sim.clear_lineage_strategy_guidance(&lineage_id, &strategy);
        }
        for (lineage_id, strategy, expires_tick) in legacy_objectives {
            sim.lineage_strategy_objectives.remove(&lineage_id);
            sim.start_strategy_objective(&lineage_id, &strategy, expires_tick);
        }
        sim.resolve_strategy_objective_expirations();
        // Old/imported saves may predate terrain effects for completed wells
        // and bridges. Reassert only operational infrastructure so an
        // unfinished project still grants no world effect.
        super::civ_tick::reconcile_operational_infrastructure(&mut sim);
        // The saved map is a cache, not source-of-truth. Rebuild it from
        // living residents and operational buildings so extinct/imported
        // stale rows disappear immediately on load without emitting events.
        super::civ::settlements::rebuild_tiers(&mut sim);
        super::civ::trade_routes::repair_loaded_state(&mut sim);
        sim
    }

    pub fn relocate_edge_squatters(&mut self) {
        use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
        let interior_w_min = (WIDTH as f32 * 0.05).ceil() + 1.0;
        let interior_w_max = WIDTH as f32 - interior_w_min - 1.0;
        let interior_h_min = (HEIGHT as f32 * 0.05).ceil() + 1.0;
        let interior_h_max = HEIGHT as f32 - interior_h_min - 1.0;

        for org in self.organisms.iter_mut() {
            let mut moved = false;
            if WorldGrid::is_edge_border(org.x as i32, org.y as i32) {
                org.x = org.x.clamp(interior_w_min, interior_w_max);
                org.y = org.y.clamp(interior_h_min, interior_h_max);
                moved = true;
            }
            if WorldGrid::is_edge_border(org.home_x as i32, org.home_y as i32) {
                org.home_x = org.home_x.clamp(interior_w_min, interior_w_max);
                org.home_y = org.home_y.clamp(interior_h_min, interior_h_max);
                moved = true;
            }
            if moved {
                org.wander_target = None;
            }
        }
        for animal in self.animals.iter_mut() {
            if WorldGrid::is_edge_border(animal.x as i32, animal.y as i32) {
                animal.x = animal.x.clamp(interior_w_min, interior_w_max);
                animal.y = animal.y.clamp(interior_h_min, interior_h_max);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved_battle(id: &str) -> super::super::warfare::Battle {
        super::super::warfare::Battle {
            id: id.to_string(),
            attackers: Vec::new(),
            defenders: Vec::new(),
            attacker_orgs: Vec::new(),
            defender_orgs: Vec::new(),
            scale: super::super::warfare::BattleScale::Skirmish,
            location: (10, 10),
            started_tick: 1,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 0,
            initial_d: 0,
        }
    }

    #[test]
    fn empty_save_json_loads_as_default_state() {
        let parsed: SaveState = serde_json::from_str("{}")
            .expect("empty {} JSON must deserialize - did a Save struct lose its serde(default)?");
        assert_eq!(parsed.tick_count, 0);
        assert!(parsed.organisms.is_empty());
        assert!(parsed.animals.is_empty());
        assert!(parsed.grid.tiles.is_empty());
        assert_eq!(parsed.weather.wind_x, 0.4);

        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-empty-save-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        std::fs::write(&path_s, "{}").unwrap();
        let _sim = Simulation::load_or_new(7, &path_s);
        let _ = std::fs::remove_file(&path_s);
    }

    #[test]
    fn mutable_depth_wind_and_operational_infrastructure_survive_reload() {
        use crate::sim::buildings::{Building, BuildingKind};

        let seed = 0x5A7E_10AD;
        let mut sim = Simulation::new(seed);
        let (water_x, water_y) = (100, 100);
        let water_index = WorldGrid::idx(water_x, water_y);
        sim.grid.set(water_x, water_y, Tile::Water);
        sim.grid.depth[water_index] = 0.73;
        sim.weather.wind_x = -0.31;
        sim.weather.wind_y = 0.62;
        sim.weather.wind_last_tick = 1_234;

        // Simulate an imported legacy world whose completed well has lost its
        // one-time terrain effect. Loading must repair it without completing
        // unfinished projects.
        let (well_x, well_y) = (110, 110);
        sim.grid.set(well_x, well_y, Tile::Grass);
        let mut completed_well = Building::new(
            90_001,
            BuildingKind::Well,
            well_x,
            well_y,
            Some("lineage-a".into()),
            10,
        );
        completed_well.condition = 1.0;
        sim.buildings.push(completed_well);
        let mut unfinished_well = Building::new(
            90_002,
            BuildingKind::Well,
            well_x + 2,
            well_y,
            Some("lineage-a".into()),
            10,
        );
        unfinished_well.condition = 0.99;
        sim.grid.set(well_x + 2, well_y, Tile::Grass);
        sim.buildings.push(unfinished_well);

        let loaded = Simulation::from_save(seed, sim.to_save_state());

        assert_eq!(loaded.grid.get(water_x, water_y), Tile::Water);
        assert!((loaded.grid.depth_at(water_x, water_y) - 0.73).abs() < f32::EPSILON);
        assert!((loaded.weather.wind_x - (-0.31)).abs() < f32::EPSILON);
        assert!((loaded.weather.wind_y - 0.62).abs() < f32::EPSILON);
        assert_eq!(loaded.weather.wind_last_tick, 1_234);
        assert_eq!(loaded.grid.get(well_x, well_y), Tile::Water);
        assert_eq!(loaded.grid.depth_at(well_x, well_y), 0.0);
        assert_eq!(loaded.grid.get(well_x + 2, well_y), Tile::Grass);
    }

    #[test]
    fn evolved_biomes_round_trip_while_legacy_saves_keep_seed_generated_terrain() {
        use crate::world::tiles::Biome;

        let seed = 0xB10B_E006;
        let (x, y) = (123, 117);
        let generated = WorldGrid::new(seed).biome_at(x, y);
        let restored = if generated == Biome::Wetland {
            Biome::Forest
        } else {
            Biome::Wetland
        };
        let mut sim = Simulation::new(seed);
        sim.grid.set_biome(x, y, restored);

        let saved = sim.to_save_state();
        assert_eq!(Simulation::from_save(seed, saved).grid.biome_at(x, y), restored);

        let mut legacy = sim.to_save_state();
        legacy.grid.biome.clear();
        assert_eq!(Simulation::from_save(seed, legacy).grid.biome_at(x, y), generated);
    }

    #[test]
    fn loading_terminal_campaign_repairs_stale_guidance_and_directives() {
        let seed = 0xCA4A_10AD;
        let mut sim = Simulation::new(seed);
        sim.tick_count = 500;
        let lineage_id = sim
            .organisms
            .iter()
            .find(|organism| organism.alive)
            .unwrap()
            .lineage_id
            .clone();
        let lineage_members: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, organism)| organism.alive && organism.lineage_id == lineage_id)
            .map(|(index, _)| index)
            .take(2)
            .collect();
        assert_eq!(lineage_members.len(), 2);
        let defender = lineage_members[0];
        sim.organisms[defender].age = sim.organisms[defender].max_age / 2;
        let personally_directed = lineage_members[1];
        sim.organisms[personally_directed].directive = "flee".to_string();
        sim.organisms[personally_directed].directive_until = 900;
        let command =
            format!(r#"{{"cmd":"guide","lineage":"{lineage_id}","strategy":"defend","duration_ticks":600}}"#);
        assert!(sim.apply_command_json(&command));

        let mut state = sim.to_save_state();
        state
            .lineage_strategy_objectives
            .get_mut(&lineage_id)
            .unwrap()
            .completed_tick = Some(500);
        let loaded = Simulation::from_save(seed, state);

        assert!(!loaded.lineage_strategies.contains_key(&lineage_id));
        assert!(!loaded.lineage_strategy_objectives.contains_key(&lineage_id));
        assert!(loaded.organisms[lineage_members[0]].directive.is_empty());
        assert_eq!(loaded.organisms[lineage_members[0]].directive_until, 0);
        assert_eq!(loaded.organisms[personally_directed].directive, "flee");
        assert_eq!(loaded.organisms[personally_directed].directive_until, 900);
    }

    #[test]
    fn building_damage_round_trips_through_current_schema() {
        use super::super::buildings::{Building, BuildingKind};

        let mut sim = Simulation::new(0xB01D);
        sim.buildings.clear();
        let mut building = Building::new(77, BuildingKind::House, 31, 32, Some("lineage-a".into()), 10);
        building.condition = 1.0;
        building.damage = 0.82;
        building.ruined_at_tick = Some(90);
        building.last_damage_tick = Some(91);
        building.last_repair_tick = Some(92);
        sim.buildings.push(building);

        let state = sim.to_save_state();
        assert_eq!(state.version, SAVE_SCHEMA_VERSION);
        let encoded = serde_json::to_string(&state).expect("serialize save state");
        let decoded: SaveState = serde_json::from_str(&encoded).expect("deserialize save state");
        let loaded = Simulation::from_save(sim.world_seed, decoded);
        let building = loaded.buildings.first().expect("persisted building");

        assert!((building.damage_fraction() - 0.82).abs() < 0.000_001);
        assert_eq!(building.ruined_at_tick, Some(90));
        assert_eq!(building.last_damage_tick, Some(91));
        assert_eq!(building.last_repair_tick, Some(92));
        assert!(building.is_ruined());
        assert_eq!(loaded.building_state_revision, 1);
        assert_eq!(loaded.serialized_building_state_revision, 0);
    }

    #[test]
    fn loading_latches_timestamp_less_full_damage_as_a_ruin() {
        use super::super::buildings::{Building, BuildingKind};

        let mut state = SaveState {
            version: SAVE_SCHEMA_VERSION,
            tick_count: 321,
            ..SaveState::default()
        };
        let mut building = Building::new(78, BuildingKind::Factory, 20, 20, None, 10);
        building.condition = 1.0;
        building.damage = 1.0;
        state.buildings.push(building);

        let loaded = Simulation::from_save(7, state);
        assert_eq!(loaded.buildings[0].ruined_at_tick, Some(321));
        assert!(loaded.buildings[0].is_ruined());
    }

    #[test]
    fn legacy_default_counters_advance_past_all_persisted_ids() {
        use super::super::agriculture::{CropKind, Farm};
        use super::super::buildings::{Building, BuildingKind};
        use super::super::culture::{ArtKind, Artwork, Festival, FestivalKind, Religion, ReligionKind};
        use super::super::language_tech::{Book, BookTopic};
        use super::super::transportation::{TransportKind, Vehicle};

        let mut state = SaveState::default();
        state.animals.push(AnimalSave {
            id: 41,
            ..AnimalSave::default()
        });
        state
            .buildings
            .push(Building::new(51, BuildingKind::Hut, 10, 10, None, 1));
        state.religions.push(Religion {
            id: "rel61".to_string(),
            kind: ReligionKind::Animism,
            name: "Old Path".to_string(),
            founded_tick: 1,
            founder_lineage: "lineage-a".to_string(),
            adherents: 2,
            last_milestone: None,
        });
        state.artworks.push(Artwork {
            id: 71,
            kind: ArtKind::CavePainting,
            creator_id: "artist-a".to_string(),
            creator_name: "Artist".to_string(),
            location: [10, 10],
            tick: 1,
            title: "First Mark".to_string(),
        });
        state.festivals.push(Festival {
            id: 81,
            lineage_id: "lineage-a".to_string(),
            name: "First Feast".to_string(),
            kind: FestivalKind::Harvest,
            start_tick: 1,
            duration_ticks: 10,
            center: [10, 10],
        });
        state.books.push(Book {
            id: 91,
            title: "Old Words".to_string(),
            author_org_id: "author-a".to_string(),
            author_name: "Author".to_string(),
            written_tick: 1,
            lineage_id: "lineage-a".to_string(),
            topic: BookTopic::History,
            copies: 1,
        });
        state.farms.push(Farm {
            id: 101,
            x: 10,
            y: 10,
            owner_lineage: "lineage-a".to_string(),
            crop: CropKind::Wheat,
            planted_tick: 1,
            ready_tick: 100,
            harvested: false,
            prepared: false,
        });
        state.vehicles.push(Vehicle {
            id: 111,
            kind: TransportKind::Cart,
            owner_lineage: "lineage-a".to_string(),
            x: 10,
            y: 10,
            occupants: Vec::new(),
            cargo: 0,
        });
        state.battles.push(saved_battle("legacy-battle-a"));
        state.battles.push(saved_battle("legacy-battle-b"));

        let loaded = Simulation::from_save(7, state);

        assert_eq!(loaded.next_animal_id, 42);
        assert_eq!(loaded.next_building_id, 52);
        assert_eq!(loaded.next_religion_id, 62);
        assert_eq!(loaded.next_artwork_id, 72);
        assert_eq!(loaded.next_festival_id, 82);
        assert_eq!(loaded.next_book_id, 92);
        assert_eq!(loaded.next_farm_id, 102);
        assert_eq!(loaded.next_vehicle_id, 112);
        assert_eq!(loaded.next_battle_id, 3);
    }

    #[test]
    fn loading_repairs_dangling_religions_and_exact_live_adherent_counts() {
        use super::super::culture::{Religion, ReligionKind};

        let mut state = SaveState {
            version: SAVE_SCHEMA_VERSION,
            ..SaveState::default()
        };
        state.religions.extend([
            Religion {
                id: "rel7".to_string(),
                kind: ReligionKind::Animism,
                name: "Living Path".to_string(),
                founded_tick: 1,
                founder_lineage: "lineage-a".to_string(),
                adherents: 99,
                last_milestone: None,
            },
            Religion {
                id: "rel8".to_string(),
                kind: ReligionKind::Animism,
                name: "Empty Path".to_string(),
                founded_tick: 2,
                founder_lineage: "lineage-b".to_string(),
                adherents: 42,
                last_milestone: None,
            },
            Religion {
                id: "rel7".to_string(),
                kind: ReligionKind::Secular,
                name: "Duplicate Later Path".to_string(),
                founded_tick: 9,
                founder_lineage: "lineage-c".to_string(),
                adherents: 500,
                last_milestone: None,
            },
        ]);
        state.organisms.extend([
            OrgSave {
                id: "valid-alive".to_string(),
                name: "Valid Alive".to_string(),
                x: 20.0,
                y: 20.0,
                alive: true,
                lineage_id: "lineage-a".to_string(),
                max_age: 20_000,
                piety: 0.8,
                religion_id: Some("rel7".to_string()),
                ..OrgSave::default()
            },
            OrgSave {
                id: "valid-dead".to_string(),
                name: "Valid Dead".to_string(),
                x: 21.0,
                y: 20.0,
                alive: false,
                lineage_id: "lineage-a".to_string(),
                max_age: 20_000,
                piety: 0.7,
                religion_id: Some("rel7".to_string()),
                ..OrgSave::default()
            },
            OrgSave {
                id: "dangling-alive".to_string(),
                name: "Dangling Alive".to_string(),
                x: 22.0,
                y: 20.0,
                alive: true,
                lineage_id: "lineage-c".to_string(),
                max_age: 20_000,
                piety: 0.9,
                religion_id: Some("rel-missing".to_string()),
                ..OrgSave::default()
            },
        ]);

        let loaded = Simulation::from_save(7, state);
        let valid_alive = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == "valid-alive")
            .unwrap();
        let valid_dead = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == "valid-dead")
            .unwrap();
        let dangling = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == "dangling-alive")
            .unwrap();

        assert_eq!(valid_alive.religion_id.as_deref(), Some("rel7"));
        assert_eq!(valid_alive.piety, 0.8);
        assert_eq!(valid_dead.religion_id.as_deref(), Some("rel7"));
        assert_eq!(valid_dead.piety, 0.7);
        assert_eq!(dangling.religion_id, None);
        assert_eq!(dangling.piety, 0.0);
        assert_eq!(loaded.religions.len(), 2);
        assert_eq!(loaded.religions[0].id, "rel7");
        assert_eq!(loaded.religions[0].name, "Living Path");
        assert_eq!(loaded.religions[0].adherents, 1);
        assert_eq!(loaded.religions[1].adherents, 0);
        assert_eq!(loaded.next_religion_id, 9);
    }

    #[test]
    fn loading_consolidates_treaties_to_one_active_record_per_pair() {
        use super::super::warfare::{Treaty, TreatyKind};

        let mut state = SaveState {
            tick_count: 50,
            ..SaveState::default()
        };
        state.treaties.extend([
            Treaty {
                lineage_a: "river".into(),
                lineage_b: "hill".into(),
                kind: TreatyKind::NonAggression,
                signed_tick: 10,
                expires_tick: 100,
            },
            Treaty {
                lineage_a: "hill".into(),
                lineage_b: "river".into(),
                kind: TreatyKind::Trade,
                signed_tick: 20,
                expires_tick: 200,
            },
            Treaty {
                lineage_a: "river".into(),
                lineage_b: "hill".into(),
                kind: TreatyKind::Alliance,
                signed_tick: 1,
                expires_tick: 40,
            },
            Treaty {
                lineage_a: "same".into(),
                lineage_b: "same".into(),
                kind: TreatyKind::Alliance,
                signed_tick: 20,
                expires_tick: 200,
            },
        ]);

        let loaded = Simulation::from_save(7, state);

        assert_eq!(loaded.treaties.len(), 1);
        assert_eq!(loaded.treaties[0].lineage_a, "hill");
        assert_eq!(loaded.treaties[0].lineage_b, "river");
        assert_eq!(loaded.treaties[0].kind, TreatyKind::Trade);
        assert_eq!(loaded.treaties[0].signed_tick, 20);
    }

    #[test]
    fn valid_saved_counter_is_never_moved_backwards() {
        assert_eq!(repaired_next_u32_id(500, [1, 20, 99].into_iter()), 500);
        assert_eq!(repaired_next_sequence(500, 12), 500);
        assert_eq!(
            repaired_next_animal_id(
                500,
                &[AnimalSave {
                    id: 99,
                    ..AnimalSave::default()
                }],
            ),
            500
        );
    }
}
