use super::*;

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct OrgSave {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) energy: f32,
    pub(super) hydration: f32,
    pub(super) health: f32,
    pub(super) age: u32,
    pub(super) alive: bool,
    pub(super) thought: String,
    pub(super) generation: u32,
    pub(super) parent_id: String,
    pub(super) lineage_id: String,
    pub(super) max_age: u32,
    pub(super) food_memory: HashMap<String, f32>,
    pub(super) water_memory: HashMap<String, f32>,
    pub(super) danger_memory: HashMap<String, f32>,
    pub(super) thought_history: Vec<crate::organism::organism::ThoughtEntry>,
    pub(super) q_table: FxHashMap<String, Vec<(u16, f32)>>,
    pub(super) last_reproduced: u64,
    pub(super) last_challenged: u64,
    pub(super) water_ticks: u32,
    pub(super) lineage_attitudes: std::collections::BTreeMap<String, f32>,
    pub(super) org_trust: std::collections::BTreeMap<String, f32>,
    pub(super) traits: crate::organism::traits::Traits,
    pub(super) infection: f32,
    pub(super) carrying: u32,
    pub(super) carrying_type: u8,
    pub(super) vocabulary: crate::organism::vocabulary::Vocabulary,
    pub(super) last_story_tick: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) life_log_legacy: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) life_log: Vec<crate::organism::organism::LifeEvent>,
    pub(super) discoveries: Vec<String>,
    pub(super) home_x: f32,
    pub(super) home_y: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) home_furniture: Vec<String>,
    #[serde(default)]
    pub(super) home_style_seed: u32,
    #[serde(default)]
    pub(super) last_experiment_tick: u64,
    pub(super) partner_id: Option<String>,
    pub(super) children_count: u32,
    pub(super) sex: String,
    pub(super) attracted_to: Option<String>,
    pub(super) attraction_tick: u64,
    pub(super) pregnant: bool,
    pub(super) pregnancy_start: u64,
    pub(super) conversations: Vec<crate::organism::organism::ConversationEntry>,
    pub(super) father_id: Option<String>,
    #[serde(default)]
    pub(super) surname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) custom_name: Option<String>,
    #[serde(default)]
    pub(super) attributes: Vec<String>,
    // ── Emotional / cognitive state (previously dropped on save) ──────
    #[serde(default)]
    pub(super) is_elder: bool,
    #[serde(default)]
    pub(super) loneliness: f32,
    #[serde(default)]
    pub(super) boredom: f32,
    #[serde(default)]
    pub(super) fear_level: f32,
    #[serde(default)]
    pub(super) comfort: f32,
    #[serde(default)]
    pub(super) grief_ticks: u32,
    #[serde(default)]
    pub(super) joy_ticks: u32,
    #[serde(default)]
    pub(super) aspiration: String,
    #[serde(default)]
    pub(super) orphaned_tick: u64,
    #[serde(default)]
    pub(super) sleep_debt: f32,
    #[serde(default)]
    pub(super) directive: String,
    #[serde(default)]
    pub(super) directive_until: u64,
    #[serde(default)]
    pub(super) journey: Option<crate::organism::organism::Journey>,
    #[serde(default)]
    pub(super) last_groomed: u64,
    #[serde(default)]
    pub(super) last_fed_kin: u64,
    #[serde(default)]
    pub(super) last_ancestral_thought: u64,
    // ── Inventory (previously dropped) ────────────────────────────────
    #[serde(default)]
    pub(super) inv_water: u8,
    #[serde(default)]
    pub(super) inv_food: u8,
    #[serde(default)]
    pub(super) inv_wood: u8,
    #[serde(default)]
    pub(super) inv_stone: u8,
    // ── Friend network (previously dropped) ───────────────────────────
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub(super) friends: std::collections::BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) anchor_events: Vec<(u64, String, f32)>,
    #[serde(default)]
    pub(super) memories: crate::organism::memory::MemoryStore,
    #[serde(default)]
    pub(super) zodiac: String,
    #[serde(default)]
    pub(super) birth_tick: u64,
    #[serde(default)]
    pub(super) mood: f32,
    #[serde(default)]
    pub(super) hope: f32,
    #[serde(default)]
    pub(super) awe: f32,
    #[serde(default)]
    pub(super) gratitude: f32,
    #[serde(default)]
    pub(super) jealousy: f32,
    #[serde(default)]
    pub(super) anger: f32,
    #[serde(default)]
    pub(super) regret: f32,
    #[serde(default)]
    pub(super) curiosity_drive: f32,
    #[serde(default)]
    pub(super) spiritual: f32,
    #[serde(default)]
    pub(super) area_ticks: u32,
    #[serde(default)]
    pub(super) last_area_cell: [i32; 2],
    #[serde(default)]
    pub(super) wander_target: Option<[i32; 2]>,
    #[serde(default)]
    pub(super) nursing_until: u64,
    #[serde(default)]
    pub(super) wealth: u32,
    #[serde(default)]
    pub(super) literacy: f32,
    #[serde(default)]
    pub(super) schooling_ticks: u32,
    #[serde(default)]
    pub(super) university_ticks: u32,
    #[serde(default)]
    pub(super) piety: f32,
    #[serde(default)]
    pub(super) specialty: Option<String>,
    #[serde(default)]
    pub(super) practice: std::collections::BTreeMap<String, f32>,
    #[serde(default)]
    pub(super) religion_id: Option<String>,
    #[serde(default)]
    pub(super) degrees: Vec<String>,
    #[serde(default)]
    pub(super) tools: std::collections::BTreeMap<String, u8>,
    #[serde(default)]
    pub(super) diseases: Vec<(String, u64)>,
    #[serde(default)]
    pub(super) disease_immunity: std::collections::BTreeMap<String, u64>,
    #[serde(default)]
    pub(super) mounted_vehicle: Option<u32>,
    #[serde(default)]
    pub(super) is_leader: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(super) death_cause: String,
}

/// A carcass a predator left where it made a kill (`sim::simulation::carcasses`).
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct CarcassSave {
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) kind: u8,
    pub(super) age: u32,
    pub(super) picked: u32,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct AnimalSave {
    pub(super) id: usize,
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) alive: bool,
    pub(super) energy: f32,
    pub(super) kind: u8,
    pub(super) last_reproduced: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) bonded_org: Option<String>,
    #[serde(default, skip_serializing_if = "is_zero_tick")]
    pub(super) born_tick: u64,
}

fn is_zero_tick(t: &u64) -> bool {
    *t == 0
}

pub(super) fn mem_encode(m: &FxHashMap<(i32, i32), f32>) -> HashMap<String, f32> {
    m.iter()
        .map(|(&(x, y), &v)| (format!("{},{}", x, y), v))
        .collect()
}

pub(super) fn mem_decode(m: HashMap<String, f32>) -> FxHashMap<(i32, i32), f32> {
    m.into_iter()
        .filter_map(|(k, v)| {
            let mut parts = k.splitn(2, ',');
            let x = parts.next()?.parse::<i32>().ok()?;
            let y = parts.next()?.parse::<i32>().ok()?;
            Some(((x, y), v))
        })
        .collect()
}

pub(super) fn org_to_save(o: &Organism) -> OrgSave {
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
        last_story_tick: o.last_story_tick,
        life_log_legacy: Vec::new(),
        life_log: o.life_log.iter().cloned().collect(),
        discoveries: o.discoveries.iter().cloned().collect(),
        home_x: o.home_x,
        home_y: o.home_y,
        home_furniture: o.home_furniture.clone(),
        home_style_seed: o.home_style_seed,
        last_experiment_tick: o.last_experiment_tick,
        partner_id: o.partner_id.clone(),
        children_count: o.children_count,
        sex: o.sex.as_str().to_string(),
        attracted_to: o.attracted_to.clone(),
        attraction_tick: o.attraction_tick,
        pregnant: o.pregnant,
        pregnancy_start: o.pregnancy_start,
        conversations: o.conversations.iter().cloned().collect(),
        father_id: o.father_id.clone(),
        surname: o.surname.clone(),
        custom_name: o.custom_name.clone(),
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
        journey: o.journey.clone(),
        last_groomed: o.last_groomed,
        last_fed_kin: o.last_fed_kin,
        last_ancestral_thought: o.last_ancestral_thought,
        inv_water: o.inv_water,
        inv_food: o.inv_food,
        inv_wood: o.inv_wood,
        inv_stone: o.inv_stone,
        friends: o.friends.clone(),
        anchor_events: o.anchor_events.clone(),
        memories: o.memories.clone(),
        zodiac: o.zodiac.clone(),
        birth_tick: o.birth_tick,
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
        practice: o.practice.clone(),
        religion_id: o.religion_id.clone(),
        degrees: o.degrees.clone(),
        tools: o.tools.clone(),
        diseases: o.diseases.clone(),
        disease_immunity: o.disease_immunity.clone(),
        mounted_vehicle: o.mounted_vehicle,
        is_leader: o.is_leader,
        death_cause: o.death_cause.clone(),
    }
}

pub(super) fn org_from_save(s: OrgSave, save_version: u32) -> Organism {
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
    o.death_cause = s.death_cause;
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
    o.discoveries = s.discoveries.into_iter().collect();
    if s.home_x != 0.0 || s.home_y != 0.0 {
        o.home_x = s.home_x;
        o.home_y = s.home_y;
    }
    o.home_furniture = s.home_furniture;
    o.home_style_seed = s.home_style_seed;
    o.last_experiment_tick = s.last_experiment_tick;
    o.partner_id = s.partner_id;
    o.children_count = s.children_count;
    o.sex = crate::organism::organism::Sex::from_str(&s.sex);
    o.attracted_to = s.attracted_to;
    o.attraction_tick = s.attraction_tick;
    o.pregnant = s.pregnant;
    o.pregnancy_start = s.pregnancy_start;
    o.conversations = s.conversations.into_iter().collect();
    o.father_id = s.father_id;
    o.surname = s.surname;
    o.custom_name = s.custom_name;
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
    o.journey = s.journey;
    o.last_groomed = s.last_groomed;
    o.last_fed_kin = s.last_fed_kin;
    o.last_ancestral_thought = s.last_ancestral_thought;
    o.inv_water = s.inv_water;
    o.inv_food = s.inv_food;
    o.inv_wood = s.inv_wood;
    o.inv_stone = s.inv_stone;
    o.friends = s.friends;
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
        o.practice = s.practice;
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

/// The number an animal kind is saved as. Stable: a save keeps its meaning across versions.
pub(super) fn kind_code(kind: AnimalKind) -> u8 {
    match kind {
        AnimalKind::Rabbit => 0,
        AnimalKind::Deer => 1,
        AnimalKind::Boar => 2,
        AnimalKind::Bird => 3,
        AnimalKind::Fish => 4,
        AnimalKind::Wolf => 5,
        AnimalKind::Dog => 6,
        AnimalKind::Bear => 7,
        AnimalKind::Sheep => 8,
        AnimalKind::Cow => 9,
        AnimalKind::Horse => 10,
        AnimalKind::Chicken => 11,
        AnimalKind::Goat => 35,
        AnimalKind::Elephant => 36,
        AnimalKind::Lion => 37,
        AnimalKind::Zebra => 38,
        AnimalKind::Zombie => 12,
        AnimalKind::Demon => 13,
        AnimalKind::Dragon => 14,
        AnimalKind::Alien => 15,
        AnimalKind::Ufo => 16,
        AnimalKind::Fox => 17,
        AnimalKind::Cat => 18,
        AnimalKind::Penguin => 19,
        AnimalKind::Camel => 20,
        AnimalKind::Frog => 21,
        AnimalKind::Whale => 22,
        AnimalKind::Duck => 28,
        AnimalKind::Bee => 29,
        AnimalKind::Owl => 30,
        AnimalKind::Eagle => 31,
        AnimalKind::Snake => 32,
        AnimalKind::Crocodile => 33,
        AnimalKind::Monkey => 34,
    }
}

/// The animal kind a saved number stands for; an unknown number is a rabbit.
pub(super) fn kind_from_code(code: u8) -> AnimalKind {
    match code {
        0 => AnimalKind::Rabbit,
        1 => AnimalKind::Deer,
        2 => AnimalKind::Boar,
        3 => AnimalKind::Bird,
        4 => AnimalKind::Fish,
        5 => AnimalKind::Wolf,
        6 => AnimalKind::Dog,
        7 => AnimalKind::Bear,
        8 => AnimalKind::Sheep,
        9 => AnimalKind::Cow,
        10 => AnimalKind::Horse,
        11 => AnimalKind::Chicken,
        12 => AnimalKind::Zombie,
        13 => AnimalKind::Demon,
        14 => AnimalKind::Dragon,
        15 => AnimalKind::Alien,
        16 => AnimalKind::Ufo,
        17 => AnimalKind::Fox,
        18 => AnimalKind::Cat,
        19 => AnimalKind::Penguin,
        20 => AnimalKind::Camel,
        21 => AnimalKind::Frog,
        22 => AnimalKind::Whale,
        28 => AnimalKind::Duck,
        29 => AnimalKind::Bee,
        30 => AnimalKind::Owl,
        31 => AnimalKind::Eagle,
        32 => AnimalKind::Snake,
        33 => AnimalKind::Crocodile,
        34 => AnimalKind::Monkey,
        35 => AnimalKind::Goat,
        36 => AnimalKind::Elephant,
        37 => AnimalKind::Lion,
        38 => AnimalKind::Zebra,
        _ => AnimalKind::Rabbit,
    }
}

pub(super) fn animal_to_save(a: &Animal) -> AnimalSave {
    AnimalSave {
        id: a.id,
        x: a.x,
        y: a.y,
        alive: a.alive,
        energy: a.energy,
        kind: kind_code(a.kind),
        last_reproduced: a.last_reproduced,
        name: a.name.clone(),
        bonded_org: a.bonded_org.clone(),
        born_tick: a.born_tick,
    }
}

pub(super) fn animal_from_save(s: AnimalSave) -> Animal {
    let kind = kind_from_code(s.kind);
    let mut a = Animal::new(s.id, s.x, s.y, kind);
    a.alive = s.alive;
    a.energy = s.energy;
    a.last_reproduced = s.last_reproduced;
    a.name = s.name;
    a.bonded_org = s.bonded_org;
    a.born_tick = s.born_tick;
    a
}
