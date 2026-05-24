use std::collections::{HashMap, HashSet, VecDeque};
use rand::Rng;
use serde::Serialize;
use super::traits::Traits;
use super::vocabulary::Vocabulary;
use crate::world::{grid::{WorldGrid, TrailKind}, tiles::Tile};

pub const N_ACTIONS: usize = 538;

pub type QRow = Vec<(u16, f32)>;

pub trait QRowExt {
    fn get_q(&self, action: u16) -> f32;
    fn set_q(&mut self, action: u16, value: f32);
    fn max_q(&self) -> f32;
}

impl QRowExt for QRow {
    fn get_q(&self, action: u16) -> f32 {
        self.iter().find(|&&(a, _)| a == action).map(|&(_, v)| v).unwrap_or(0.0)
    }
    fn set_q(&mut self, action: u16, value: f32) {
        if let Some(slot) = self.iter_mut().find(|(a, _)| *a == action) {
            slot.1 = value;
        } else {
            self.push((action, value));
        }
    }
    fn max_q(&self) -> f32 {
        let m = self.iter().map(|&(_, v)| v).fold(f32::NEG_INFINITY, f32::max);
        if m.is_finite() { m } else { 0.0 }
    }
}

pub const DIRECTIONS: [(i32, i32); 8] =
    [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)];

const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS:     &[u8] = b"aeiou";

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, serde::Deserialize, Default)]
pub enum Sex { #[default] Male, Female }

impl Sex {
    pub fn random(rng: &mut impl Rng) -> Self {
        if rng.random::<bool>() { Sex::Male } else { Sex::Female }
    }
    pub fn as_str(self) -> &'static str {
        match self { Sex::Male => "male", Sex::Female => "female" }
    }
    pub fn from_str(s: &str) -> Self {
        if s == "female" { Sex::Female } else { Sex::Male }
    }
}

pub fn generate_name(rng: &mut impl Rng, sex: Sex) -> String {
    let syllables = rng.random_range(2..=3);
    let mut s = String::new();
    for i in 0..syllables {
        s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
        s.push(VOWELS[rng.random_range(0..VOWELS.len())] as char);
        if i == syllables - 1 && sex == Sex::Male && rng.random::<f32>() < 0.65 {
            s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
        }
    }
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

pub fn generate_tribe_name(rng: &mut impl Rng) -> String {
    const TRIBE_CONS: &[u8] = b"bdfghjklmnprstvwz";
    const TRIBE_VOWELS: &[u8] = b"aeiou";
    let syllables = rng.random_range(2..=3usize);
    let mut s = String::new();
    for i in 0..syllables {
        s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        s.push(TRIBE_VOWELS[rng.random_range(0..TRIBE_VOWELS.len())] as char);
        if i < syllables - 1 && rng.random::<f32>() < 0.30 {
            s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        }
        if i == syllables - 1 && rng.random::<f32>() < 0.60 {
            s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        }
    }
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

pub fn apply_sex_traits(traits: &mut crate::organism::traits::Traits, sex: Sex) {
    match sex {
        Sex::Male => {
            traits.aggression      = (traits.aggression      + 0.06).clamp(0.05, 0.95);
            traits.curiosity       = (traits.curiosity       + 0.02).clamp(0.05, 0.95);
            traits.social_tendency = (traits.social_tendency - 0.04).clamp(0.05, 0.95);
        }
        Sex::Female => {
            traits.resilience      = (traits.resilience      + 0.05).clamp(0.05, 0.95);
            traits.social_tendency = (traits.social_tendency + 0.05).clamp(0.05, 0.95);
            traits.memory_strength = (traits.memory_strength + 0.04).clamp(0.05, 0.95);
        }
    }
}

fn dir_char(dx: i32, dy: i32) -> char {
    if dx == 0 && dy == 0 { return 'O'; }
    if dx.abs() >= dy.abs() { if dx > 0 { 'E' } else { 'W' } }
    else                    { if dy > 0 { 'S' } else { 'N' } }
}

#[derive(Default, Clone, Serialize, serde::Deserialize)]
#[serde(default)]
pub struct ThoughtEntry {
    pub tick: u64,
    pub text: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
pub struct LifeEvent {
    pub tick: u64,
    pub category: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_name: Option<String>,
}

#[derive(Default, Clone, Serialize, serde::Deserialize)]
#[serde(default)]
pub struct ConversationEntry {
    pub tick:      u64,
    pub with_name: String,
    pub with_id:   String,
    pub kind:      String,
    pub lines:     Vec<[String; 2]>,
    pub meanings:  Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id:        String,
}

pub struct Organism {
    pub id:          String,
    pub name:        String,
    pub x:           f32,
    pub y:           f32,
    pub prev_x:      f32,
    pub prev_y:      f32,
    pub vx_smooth:   f32,
    pub vy_smooth:   f32,
    pub energy:      f32,
    pub hydration:   f32,
    pub health:      f32,
    pub age:         u32,
    pub alive:       bool,
    pub thought:     String,
    /// True when `thought` was set this tick. The SoA delta builder
    /// reads + clears this so we only ship a per-org thought string
    /// over the wire when it changed. Initialised to `true` so a
    /// freshly-spawned org's first thought reaches the client.
    pub thought_dirty: bool,
    pub generation:  u32,
    pub parent_id:   String,
    pub father_id:   Option<String>,
    pub lineage_id:  String,
    pub max_age:     u32,

    pub food_memory:   HashMap<(i32,i32), f32>,
    pub water_memory:  HashMap<(i32,i32), f32>,
    pub danger_memory: HashMap<(i32,i32), f32>,

    pub thought_history: VecDeque<ThoughtEntry>,

    pub q_table: HashMap<String, QRow>,

    pub last_reproduced: u64,
    pub last_challenged: u64,

    pub lineage_attitudes: HashMap<String, f32>,
    pub org_trust:         HashMap<String, f32>,

    pub traits:         Traits,
    pub infection:      f32,
    pub carrying:       u32,
    pub carrying_type:  u8,

    pub vocabulary:    Vocabulary,
    pub daily_story:   String,
    pub last_story_tick: u64,
    pub life_log:      VecDeque<LifeEvent>,
    pub discoveries:   HashSet<String>,

    pub home_x: f32,
    pub home_y: f32,
    pub home_furniture: Vec<String>,
    pub home_style_seed: u32,

    pub is_elder:            bool,
    pub has_reflected:       bool,
    pub last_invention_tick: u64,

    pub directive:       String,
    pub directive_until: u64,
    pub last_think_tick: u64,
    pub last_think_by_kind: HashMap<String, u64>,

    pub loneliness:  f32,
    pub boredom:     f32,
    pub fear_level:  f32,
    pub comfort:     f32,

    pub grief_ticks:    u32,
    /// Tick at which this org last lost a parent (parent_id / father_id
    /// matched a death event). Used by kin in the social tick to bias
    /// share_food / groom toward newly-orphaned minors. 0 = never.
    pub orphaned_tick:  u64,
    pub sleep_debt:     f32,
    pub water_ticks:    u32,
    pub area_ticks:     u32,
    pub last_area_cell: (i32, i32),
    pub wander_target:  Option<(i32, i32)>,
    pub last_groomed:   u64,
    pub last_fed_kin:   u64,
    pub last_ancestral_thought: u64,

    pub partner_id:     Option<String>,
    pub children_count: u32,
    pub sex:            Sex,

    pub attracted_to:    Option<String>,
    pub attraction_tick: u64,

    pub pregnant:        bool,
    pub pregnancy_start: u64,

    pub inv_water: u8,
    pub inv_food:  u8,
    pub inv_wood:  u8,
    pub inv_stone: u8,

    pub nursing_until: u64,

    pub wealth:      u32,
    pub literacy:    f32,
    pub schooling_ticks: u32,
    pub university_ticks: u32,
    pub piety:       f32,
    pub specialty:   Option<String>,
    pub religion_id: Option<String>,
    pub degrees:     Vec<String>,
    pub tools:       HashMap<String, u8>,
    pub diseases:    Vec<(String, u64)>,
    pub disease_immunity: HashMap<String, u64>,
    pub mounted_vehicle: Option<u32>,
    pub is_leader:   bool,

    pub conversations:   VecDeque<ConversationEntry>,

    // Named friends: org_id → name. Forms from repeated positive interaction.
    // Unlike org_trust (which is anonymous and decays), friendships are recognized bonds.
    pub friends: HashMap<String, String>,

    // Accumulated descriptors: birth traits (handsome, curious) + earned ones (builder, sage).
    pub attributes: HashSet<String>,

    pub anchor_events: Vec<(u64, String, f32)>,
}

impl Organism {
    pub fn think_ready(&self, scenario: &str, tick: u64, cooldown: u64) -> bool {
        let last = self.last_think_by_kind.get(scenario).copied().unwrap_or(0);
        tick.saturating_sub(last) >= cooldown
    }

    pub fn mark_thought(&mut self, scenario: &str, tick: u64) {
        self.last_think_by_kind.insert(scenario.to_string(), tick);
        self.last_think_tick = tick;
    }

    pub fn carry_load(&self) -> u32 {
        self.inv_water as u32 + self.inv_food as u32
            + self.inv_wood as u32 + self.inv_stone as u32
    }

    pub fn carry_max(&self) -> u32 {
        let base: u32 = match self.sex { Sex::Male => 12, Sex::Female => 8 };
        base + (self.traits.resilience * 4.0) as u32
    }

    pub fn carry_room(&self) -> u32 {
        self.carry_max().saturating_sub(self.carry_load())
    }

    pub fn new(
        id: String, name: String,
        x: f32, y: f32,
        generation: u32, parent_id: String, lineage_id: String,
        max_age: u32, traits: Traits,
    ) -> Self {
        Organism {
            id, name, x, y,
            prev_x: x, prev_y: y,
            vx_smooth: 0.0, vy_smooth: 0.0,
            energy: 1.0, hydration: 1.0, health: 1.0,
            age: 0, alive: true,
            thought: "observing".to_string(),
            thought_dirty: true,
            generation, parent_id, father_id: None, lineage_id, max_age,
            food_memory:   HashMap::new(),
            water_memory:  HashMap::new(),
            danger_memory: HashMap::new(),
            thought_history: VecDeque::new(),
            q_table: HashMap::new(),
            last_reproduced: 0,
            last_challenged: 0,
            lineage_attitudes: HashMap::new(),
            org_trust: HashMap::new(),
            traits, infection: 0.0,
            carrying: 0,
            carrying_type: 0,
            vocabulary: Vocabulary::from_hashmap(&std::collections::HashMap::new()),
            daily_story: String::new(),
            last_story_tick: 0,
            life_log: VecDeque::new(),
            discoveries: HashSet::new(),
            home_x: x,
            home_y: y,
            home_furniture: Vec::new(),
            home_style_seed: 0,
            is_elder: false,
            has_reflected: false,
            last_invention_tick: 0,
            directive: String::new(),
            directive_until: 0,
            last_think_tick: 0,
            last_think_by_kind: HashMap::new(),
            loneliness:  0.0,
            boredom:     0.0,
            fear_level:  0.0,
            comfort:     0.5,
            grief_ticks:    0,
            orphaned_tick:  0,
            sleep_debt:     0.0,
            water_ticks:    0,
            area_ticks:     0,
            last_area_cell: (x as i32, y as i32),
            wander_target:  None,
            last_groomed:   0,
            last_fed_kin:   0,
            last_ancestral_thought: 0,
            partner_id:     None,
            children_count: 0,
            sex:            Sex::Male,
            attracted_to:    None,
            attraction_tick: 0,
            pregnant:        false,
            pregnancy_start: 0,
            inv_water:       0,
            inv_food:        0,
            inv_wood:        0,
            inv_stone:       0,
            nursing_until:   0,
            wealth:          5,
            literacy:        0.0,
            schooling_ticks: 0,
            university_ticks: 0,
            piety:           0.0,
            specialty:       None,
            religion_id:     None,
            degrees:         Vec::new(),
            tools:           HashMap::new(),
            diseases:        Vec::new(),
            disease_immunity: HashMap::new(),
            mounted_vehicle: None,
            is_leader:       false,
            conversations:   VecDeque::new(),
            friends:         HashMap::new(),
            attributes:      HashSet::new(),
            anchor_events:   Vec::new(),
        }
    }

    pub fn age_stage(&self) -> crate::sim::age_stage::AgeStage {
        crate::sim::age_stage::AgeStage::from_age(self.age, self.max_age)
    }

    pub fn give_tool(&mut self, tool: &str) {
        let cur = self.tools.get(tool).copied().unwrap_or(0);
        if cur < 8 {
            self.tools.insert(tool.to_string(), cur + 1);
        }
    }

    pub fn has_tool(&self, tool: &str) -> bool {
        self.tools.get(tool).copied().unwrap_or(0) > 0
    }

    pub fn combat_tool_bonus(&self) -> f32 {
        if self.has_tool("rifle") { return 4.5; }
        if self.has_tool("musket") { return 3.0; }
        if self.has_tool("iron_sword") { return 1.8; }
        if self.has_tool("bronze_spear") { return 1.4; }
        if self.has_tool("stone_spear") { return 1.2; }
        1.0
    }

    pub fn add_degree(&mut self, degree: &str) {
        let d = degree.to_string();
        if !self.degrees.contains(&d) {
            self.degrees.push(d);
        }
    }

    pub fn add_anchor(&mut self, tick: u64, desc: String, strength: f32) {
        self.anchor_events.push((tick, desc, strength.clamp(0.0, 1.0)));
        if self.anchor_events.len() > 12 {
            let mut weakest_idx = 0usize;
            let mut weakest_val = f32::INFINITY;
            for (i, e) in self.anchor_events.iter().enumerate() {
                if e.2 < weakest_val {
                    weakest_val = e.2;
                    weakest_idx = i;
                }
            }
            self.anchor_events.remove(weakest_idx);
        }
    }

    // Promote an organism to named friend status.
    // Idempotent - safe to call repeatedly; only logs + mutates loneliness on first promotion.
    pub fn add_friend(&mut self, id: &str, name: &str, tick: u64) {
        if !self.friends.contains_key(id) {
            const MAX_FRIENDS: usize = 12;
            if self.friends.len() >= MAX_FRIENDS {
                let weakest = self.friends.keys()
                    .min_by_key(|fid| (self.org_trust.get(fid.as_str()).copied().unwrap_or(0.0) * 1000.0) as i32)
                    .cloned();
                if let Some(k) = weakest { self.friends.remove(&k); }
            }
            self.friends.insert(id.to_string(), name.to_string());
            self.log_life_rel(tick, "friendship",
                format!("became close friends with {}", name),
                Some(id.to_string()), Some(name.to_string()));
            self.loneliness = (self.loneliness - 0.25).max(0.0);
        }
    }

    pub fn trim_social_maps(&mut self) {
        const MAX_TRUST:     usize = 32;
        const TRUST_KEEP:    usize = 24;
        const MAX_ATTITUDES: usize = 24;
        const ATT_KEEP:      usize = 18;
        if self.org_trust.len() > MAX_TRUST {
            let mut v: Vec<(String, f32)> = self.org_trust.drain().collect();
            v.sort_by(|a, b| b.1.abs().partial_cmp(&a.1.abs()).unwrap_or(std::cmp::Ordering::Equal));
            v.truncate(TRUST_KEEP);
            self.org_trust = v.into_iter().collect();
        }
        if self.lineage_attitudes.len() > MAX_ATTITUDES {
            let mut v: Vec<(String, f32)> = self.lineage_attitudes.drain().collect();
            v.sort_by(|a, b| b.1.abs().partial_cmp(&a.1.abs()).unwrap_or(std::cmp::Ordering::Equal));
            v.truncate(ATT_KEEP);
            self.lineage_attitudes = v.into_iter().collect();
        }
    }

    pub fn store_conversation(&mut self, entry: ConversationEntry) {
        self.conversations.push_back(entry);
        if self.conversations.len() > 20 {
            self.conversations.pop_front();
        }
    }

    pub fn discover(&mut self, what: &str) -> bool {
        let inserted = self.discoveries.insert(what.to_string());
        // Cap so a future free-form discovery string (e.g. LLM-suggested
        // verb-noun pair) can't grow the set unboundedly. 64 is well
        // above the current ~25 hand-written discoveries and the
        // pathological worst case at high LLM density. Eviction is
        // arbitrary because HashSet has no insertion-order - we drop
        // a random element which, on a stable interner-style set, is
        // fine: the dropped knowledge is rare or stale.
        if inserted && self.discoveries.len() > 64 {
            if let Some(victim) = self.discoveries.iter().next().cloned() {
                self.discoveries.remove(&victim);
            }
        }
        inserted
    }

    pub fn log_event(&mut self, text: String) {
        self.log_life(0, "event", text);
    }

    pub fn log_life(&mut self, tick: u64, category: &str, text: String) {
        self.log_life_rel(tick, category, text, None, None);
    }

    pub fn log_life_rel(&mut self, tick: u64, category: &str, text: String,
                        related_id: Option<String>, related_name: Option<String>) {
        self.life_log.push_back(LifeEvent { tick, category: category.to_string(), text, related_id, related_name });
        if self.life_log.len() > 64 {
            self.life_log.pop_front();
        }
    }

    pub fn remember(mem: &mut HashMap<(i32,i32), f32>, x: i32, y: i32,
                    strength: f32, mem_trait: f32) {
        let effective = (strength * (0.7 + 0.6 * mem_trait)).min(1.0);
        let v = mem.entry((x, y)).or_insert(0.0);
        *v = (*v + effective).min(1.0);
    }

    pub fn update_attitude(&mut self, other_lid: &str, delta: f32) {
        if other_lid == self.lineage_id { return; }
        let v = self.lineage_attitudes.entry(other_lid.to_string()).or_insert(0.0);
        *v = (*v + delta).max(-1.0).min(1.0);
    }

    pub fn tick_inner_state(&mut self, kin_near: usize, near_shelter: bool,
                            hostile_near: bool, weather_kind: u8, tick: u64, night: bool) {
        if kin_near == 0 {
            self.loneliness = (self.loneliness + 0.0008).min(1.0);
        } else {
            self.loneliness = (self.loneliness - kin_near as f32 * 0.012).max(0.0);
        }

        if hostile_near || self.energy < 0.25 || self.hydration < 0.25 {
            self.boredom = (self.boredom - 0.002).max(0.0);
        } else {
            self.boredom = (self.boredom + 0.002).min(1.0);
        }

        if hostile_near {
            self.fear_level = (self.fear_level + 0.05).min(1.0);
        } else {
            self.fear_level = (self.fear_level - 0.006).max(0.0);
        }
        if self.energy < 0.2 || self.hydration < 0.2 {
            self.fear_level = (self.fear_level + 0.015).min(1.0);
        }
        if self.health < 0.3 {
            self.fear_level = (self.fear_level + 0.008).min(1.0);
        }

        if self.grief_ticks > 0 {
            self.grief_ticks = self.grief_ticks.saturating_sub(1);
            self.fear_level = (self.fear_level + 0.004).min(1.0);
        }

        if night && !near_shelter {
            self.sleep_debt = (self.sleep_debt + 0.0015).min(1.0);
        } else if near_shelter {
            self.sleep_debt = (self.sleep_debt - 0.010).max(0.0);
        } else {
            self.sleep_debt = (self.sleep_debt - 0.001).max(0.0);
        }
        if self.sleep_debt > 0.4 {
            let drain = 0.0004 * self.sleep_debt * (if near_shelter { 0.4 } else { 1.0 });
            self.energy = (self.energy - drain).max(0.0);
        }

        let cell = (self.x as i32 / 10, self.y as i32 / 10);
        if cell == self.last_area_cell {
            self.area_ticks = self.area_ticks.saturating_add(1);
            if self.area_ticks > 60 && self.boredom > 0.20 && self.wander_target.is_none() {
                let hash = self.id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
                let angle = ((hash ^ tick) as f32) * 0.0000014;
                let dist  = 120.0 + self.traits.curiosity * 380.0;
                let tx = (self.x + angle.sin() * dist).round() as i32;
                let ty = (self.y + angle.cos() * dist).round() as i32;
                self.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        } else {
            self.last_area_cell = cell;
            self.area_ticks     = 0;
            if let Some(wt) = self.wander_target {
                if (wt.0 - self.x as i32).abs() + (wt.1 - self.y as i32).abs() < 8 {
                    self.wander_target = None;
                }
            }
        }

        if let Some(wt) = self.wander_target {
            if (wt.0 - self.x as i32).abs() + (wt.1 - self.y as i32).abs() <= 6 {
                self.wander_target = None;
            }
        }

        if self.wander_target.is_none() {
            let id_hash = self.id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
            let period  = (900u64).saturating_sub((self.traits.curiosity * 300.0) as u64).max(300);
            let offset  = id_hash % period;
            if tick % period == offset {
                let angle = ((id_hash ^ tick) as f32) * 0.0000014;
                let dist  = 150.0 + self.traits.curiosity * 400.0;
                let tx = (self.x + angle.sin() * dist).round() as i32;
                let ty = (self.y + angle.cos() * dist).round() as i32;
                self.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        let shelter_bonus = if near_shelter { 0.25 } else { 0.0 };
        let wet_penalty   = if weather_kind >= 2 && !near_shelter { 0.2 }
                            else if weather_kind == 1 && !near_shelter { 0.08 }
                            else { 0.0 };
        self.comfort = ((self.energy + self.hydration + self.health
            + (1.0 - self.loneliness) * 0.5
            + shelter_bonus - wet_penalty
            - self.fear_level * 0.3
            - self.sleep_debt * 0.15) / 4.0).clamp(0.0, 1.0);

        let passive = matches!(self.thought.as_str(),
            "observing"|"exploring"|"satisfied"|"at peace"|"restless"|"feeling alone"|
            "terrified"|"mourning kin"|"exhausted"|"wandering");
        if passive {
            if self.grief_ticks > 20 {
                self.think("mourning kin", tick);
            } else if self.sleep_debt > 0.55 {
                self.think("exhausted", tick);
            } else if self.fear_level > 0.65 {
                self.think("terrified", tick);
            } else if self.loneliness > 0.75 {
                self.think("feeling alone", tick);
            } else if self.boredom > 0.65 {
                self.think("restless", tick);
            } else if self.comfort > 0.82 {
                self.think("at peace", tick);
            }
        }
    }

    pub fn attitude_toward(&self, other_lid: &str) -> f32 {
        if other_lid == self.lineage_id { return 1.0; }
        *self.lineage_attitudes.get(other_lid).unwrap_or(&0.0)
    }

    pub fn compress_for_archive(&mut self) {
        if self.alive { return; }
        self.food_memory.clear();
        self.water_memory.clear();
        self.danger_memory.clear();
        self.thought_history.clear();
        self.q_table.clear();
        self.lineage_attitudes.clear();
        self.org_trust.clear();
        self.life_log.clear();
        self.discoveries.clear();
        self.conversations.clear();
        self.friends.clear();
        self.attributes.clear();
    }

    pub fn decay_memory(&mut self, tick: u64) {
        self.vocabulary.decay(tick, 5000);
        for mem in [&mut self.food_memory, &mut self.water_memory, &mut self.danger_memory] {
            mem.retain(|_, v| { *v *= 0.995; *v >= 0.04 });
        }
        fn trim_mem(mem: &mut HashMap<(i32,i32), f32>, max: usize) {
            if mem.len() > max {
                let mut e: Vec<_> = mem.iter().map(|(k,v)| (*k, *v)).collect();
                e.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
                for (k, _) in &e[..e.len() - max] { mem.remove(k); }
            }
        }
        trim_mem(&mut self.food_memory,    70);
        trim_mem(&mut self.water_memory,   35);
        trim_mem(&mut self.danger_memory,  20);
        self.lineage_attitudes.retain(|_, v| { *v *= 0.998; v.abs() >= 0.01 });
        self.org_trust.retain(|_, v| {
            *v *= if *v > 0.0 { 0.9997 } else { 0.999 };
            v.abs() >= 0.01
        });

        const Q_MAX:  usize = 180;
        const Q_TRIM: usize = 130;
        if self.q_table.len() > Q_MAX {
            let mut entries: Vec<(String, QRow)> = self.q_table.drain().collect();
            entries.sort_by(|a, b| {
                let va = a.1.max_q();
                let vb = b.1.max_q();
                vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
            });
            entries.truncate(Q_TRIM);
            self.q_table.extend(entries);
        }
    }

    pub fn best_remembered(mem: &HashMap<(i32,i32), f32>, ox: f32, oy: f32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (ox as i32, oy as i32);
        let mut best_score = 0.03f32;
        let mut best_loc   = None;
        for (&(mx, my), &val) in mem {
            let dist = (mx - ix).abs() + (my - iy).abs();
            if dist == 0 { continue; }
            let score = val / (1.0 + dist as f32 * 0.03);
            if score > best_score {
                best_score = score;
                best_loc = Some((mx, my));
            }
        }
        best_loc
    }

    pub fn think(&mut self, text: &str, tick: u64) {
        if self.thought == text { return; }
        self.thought = text.to_string();
        self.thought_dirty = true;
        self.thought_history.push_back(ThoughtEntry { tick, text: text.to_string() });
        if self.thought_history.len() > 40 {
            self.thought_history.pop_front();
        }
    }

    pub fn perceive(&self, grid: &WorldGrid, organisms: &[Organism], night: bool, animal_near: bool, spatial: &crate::sim::spatial::SpatialIndex) -> String {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let scan: i32 = if night {
            if self.traits.curiosity > 0.7 { 8 } else { 6 }
        } else { 8 };

        let hunger_raw = if self.energy    < 0.2 { 2 } else if self.energy    < 0.5 { 1 } else { 0 };
        let hunger = if self.infection > 0.5 { hunger_raw.max(1) } else { hunger_raw };
        let thirst = if self.hydration < 0.2 { 2 } else if self.hydration < 0.5 { 1 } else { 0 };

        let mut food_dx = 0i32; let mut food_dy = 0i32;
        let mut water_dx = 0i32; let mut water_dy = 0i32;
        let mut food_dist  = 999i32;
        let mut water_dist = 999i32;
        let mut fire_near  = false;
        let fire_r = (2.0 + 2.0 * self.traits.fear) as i32;

        for dx in -scan..=scan {
            for dy in -scan..=scan {
                let t = grid.get(ix + dx, iy + dy);
                let dist = dx.abs() + dy.abs();
                match t {
                    Tile::Food  if dist < food_dist  => { food_dist  = dist; food_dx  = dx; food_dy  = dy; }
                    Tile::Water if dist < water_dist => { water_dist = dist; water_dx = dx; water_dy = dy; }
                    Tile::Fire  if dist <= fire_r    => { fire_near = true; }
                    _ => {}
                }
            }
        }

        let food_dir  = if food_dist  == 999 { 'X' } else { dir_char(food_dx,  food_dy)  };
        let water_dir = if water_dist == 999 { 'X' } else { dir_char(water_dx, water_dy) };

        // Spatial-bucketed neighbour scan instead of walking every
        // organism in the world. Radius 5 in tile space; the index
        // returns a slight superset (bucket-aligned), so we still
        // apply the Manhattan-distance filter on hits.
        let mut org_near = 0u8;
        let mut kin_near = 0u8;
        let mut buf: Vec<usize> = Vec::with_capacity(16);
        spatial.query_into(self.x as i32, self.y as i32, 5, &mut buf);
        for &i in &buf {
            let other = &organisms[i];
            if std::ptr::eq(other, self) || !other.alive { continue; }
            if (other.x - self.x).abs() + (other.y - self.y).abs() <= 5.0 {
                org_near = 1;
                if other.lineage_id == self.lineage_id { kin_near = 1; break; }
            }
        }

        let food_tr  = if grid.detect_trail(ix, iy, TrailKind::Food,  5) > 0.4 { 1 } else { 0 };
        let water_tr = if grid.detect_trail(ix, iy, TrailKind::Water, 5) > 0.4 { 1 } else { 0 };

        let att_char = {
            let mut nearest_lid: Option<&str> = None;
            let mut nearest_d = 999.0f32;
            // Same spatial bucket reuse - nearest non-kin within `scan`.
            buf.clear();
            spatial.query_into(self.x as i32, self.y as i32, scan as i32, &mut buf);
            for &i in &buf {
                let other = &organisms[i];
                if std::ptr::eq(other, self) || !other.alive || other.lineage_id == self.lineage_id { continue; }
                let d = (other.x - self.x).abs() + (other.y - self.y).abs();
                if d < nearest_d { nearest_d = d; nearest_lid = Some(&other.lineage_id); }
            }
            match nearest_lid {
                Some(lid) if nearest_d <= scan as f32 => {
                    let att = self.attitude_toward(lid);
                    if att >= 0.25 { 'A' } else if att <= -0.25 { 'H' } else { 'N' }
                }
                _ => 'X',
            }
        };

        let inf_level = if self.infection > 0.4 { '2' } else if self.infection > 0.15 { '1' } else { '0' };

        let danger_near = self.danger_memory.iter().any(|(&(mx, my), &v)| {
            v > 0.30 && (mx - ix).abs() + (my - iy).abs() <= 5
        });

        let warmth_char = {
            let mut has_warmth = false;
            'outer: for ddx in -4i32..=4 {
                for ddy in -4i32..=4 {
                    if grid.get(ix + ddx, iy + ddy) == crate::world::tiles::Tile::Campfire {
                        has_warmth = true; break 'outer;
                    }
                }
            }
            if has_warmth { 'W' }
            else if grid.temp_at(ix, iy) < 8.0 { 'C' }
            else { 'N' }
        };

        let carry_char = match (self.carrying > 0, self.carrying_type) {
            (true, 2) => 'R',
            (true, _) => 'K',
            _         => '0',
        };

        let shelter_char = {
            let mut s = false;
            'sh: for ddx in -2i32..=2 {
                for ddy in -2i32..=2 {
                    let nx = ix + ddx; let ny = iy + ddy;
                    if matches!(grid.get(nx, ny), Tile::Hut | Tile::Rock)
                        || grid.structure_at(nx, ny) >= 0.35
                    {
                        s = true; break 'sh;
                    }
                }
            }
            if s { 'S' } else { 'E' }
        };

        let animal_char = if animal_near { 'A' } else { '.' };

        let hazard_val = if crate::world::grid::WorldGrid::in_bounds(ix, iy) {
            grid.hazard[crate::world::grid::WorldGrid::idx(ix, iy)]
        } else { 0.0 };
        let hazard_char = if hazard_val > 0.15 { 'H' } else if hazard_val > 0.05 { 'h' } else { '.' };

        format!("{hunger}{thirst}{food_dir}{water_dir}{fire_near_c}{org_near}{food_tr}{water_tr}{kin_near}{att_char}{inf_level}{dnear}{warmth}{carry}{shelter}{animal}{hazard}",
            hunger = hunger,
            thirst = thirst,
            food_dir = food_dir,
            water_dir = water_dir,
            fire_near_c = if fire_near { 1 } else { 0 },
            org_near = org_near,
            food_tr = food_tr,
            water_tr = water_tr,
            kin_near = kin_near,
            att_char = att_char,
            inf_level = inf_level,
            dnear = if danger_near { 'D' } else { 'S' },
            warmth = warmth_char,
            carry  = carry_char,
            shelter = shelter_char,
            animal  = animal_char,
            hazard  = hazard_char,
        )
    }

    pub fn near_shelter(&self, grid: &WorldGrid) -> bool {
        let (ix, iy) = (self.x as i32, self.y as i32);
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| {
            let nx = ix + dx; let ny = iy + dy;
            matches!(grid.get(nx, ny), Tile::Hut | Tile::Rock | Tile::Campfire)
                || grid.structure_at(nx, ny) >= 0.35
        }))
    }

    pub(crate) fn find_shelter_tile(&self, grid: &WorldGrid, radius: i32) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best: Option<(i32, i32)> = None;
        let mut best_dist = radius + 1;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx; let ny = iy + dy;
                let is_shelter = matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire)
                    || grid.structure_at(nx, ny) >= 0.35;
                if is_shelter {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist { best_dist = dist; best = Some((nx, ny)); }
                }
            }
        }
        best
    }

    pub(crate) fn toward(&self, target: (i32, i32), grid: &WorldGrid) -> usize {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let (tx, ty) = target;
        let dx = tx - ix; let dy = ty - iy;
        let target_is_water = grid.get(tx, ty) == Tile::Water;
        let mut best_action = 0;
        let mut best_score  = i32::MIN;
        for (i, (adx, ady)) in DIRECTIONS.iter().enumerate() {
            let mut score = adx * dx + ady * dy;
            let t = grid.get(ix + adx, iy + ady);
            if matches!(t, Tile::Rock | Tile::Void) { score = i32::MIN; }
            if t == Tile::Water {
                let depth = grid.depth_at(ix + adx, iy + ady);
                if target_is_water {
                    score -= (depth * 8.0).round() as i32;
                } else if depth > 0.18 {
                    score -= 10_000;
                } else {
                    score -= 6;
                }
            }
            if score > best_score { best_score = score; best_action = i; }
        }
        best_action
    }

    pub(crate) fn nearest_land(&self, grid: &WorldGrid, radius: i32) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_dist = radius + 1;
        let mut best = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx;
                let ny = iy + dy;
                let tile = grid.get(nx, ny);
                if matches!(tile, Tile::Water | Tile::Rock | Tile::Void | Tile::Fire | Tile::Hut | Tile::Mineral) {
                    continue;
                }
                let dist = dx.abs() + dy.abs();
                if dist > 0 && dist < best_dist {
                    best_dist = dist;
                    best = Some((nx, ny));
                }
            }
        }
        best
    }

    pub(crate) fn nearest_visible(&self, grid: &WorldGrid, tile_type: Tile, radius: i32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_dist = radius + 1;
        let mut best_loc  = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if grid.get(ix + dx, iy + dy) == tile_type {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist { best_dist = dist; best_loc = Some((ix+dx, iy+dy)); }
                }
            }
        }
        best_loc
    }

    pub(crate) fn find_trail_target(&self, grid: &WorldGrid, kind: TrailKind, radius: i32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_val = 0.35f32;
        let mut best_loc = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let v = grid.trail_at(ix + dx, iy + dy, kind);
                if v > best_val { best_val = v; best_loc = Some((ix+dx, iy+dy)); }
            }
        }
        best_loc
    }

    pub fn learn(&mut self, perception: &str, action: usize, reward: f32, next_perception: &str) {
        let alpha = 0.15f32;
        let gamma = 0.9f32;
        let action_u16 = action as u16;

        let best_next = self.q_table.get(next_perception)
            .map(|r| r.max_q())
            .unwrap_or(0.0);

        let effective_reward = if reward < 0.0 {
            reward * 1.4
        } else if reward < 0.01 {
            reward - 0.01
        } else {
            reward
        };

        if let Some(row) = self.q_table.get_mut(perception) {
            let old = row.get_q(action_u16);
            let new_val = old + alpha * (effective_reward + gamma * best_next - old);
            row.set_q(action_u16, new_val);
        } else {
            let mut row = QRow::default();
            let old = row.get_q(action_u16);
            let new_val = old + alpha * (effective_reward + gamma * best_next - old);
            row.set_q(action_u16, new_val);
            self.q_table.insert(perception.to_string(), row);
        }
    }

    pub fn to_json(&self) -> OrgJson { self.to_json_with(true) }

    pub fn to_json_with(&self, include_cold: bool) -> OrgJson {
        OrgJson {
            id:       self.id.clone(),
            x:        (self.x * 10.0).round() / 10.0,
            y:        (self.y * 10.0).round() / 10.0,
            energy:   (self.energy    * 1000.0).round() / 1000.0,
            hydration:(self.hydration * 1000.0).round() / 1000.0,
            health:   (self.health    * 1000.0).round() / 1000.0,
            age:      self.age,
            alive:    self.alive,
            thought:  self.thought.clone(),
            infection:     (self.infection * 1000.0).round() / 1000.0,
            fear_level:    (self.fear_level * 100.0).round() / 100.0,
            carrying:      self.carrying,
            carrying_type: self.carrying_type,
            pregnant:      self.pregnant,
            partner_id:    self.partner_id.clone(),
            attracted_to:  self.attracted_to.clone(),

            attitudes: if include_cold {
                Some(self.lineage_attitudes.iter()
                    .filter(|(_, &v)| v.abs() > 0.1)
                    .map(|(k, &v)| (k.clone(), (v * 100.0).round() / 100.0))
                    .collect())
            } else { None },
            org_trust: if include_cold {
                Some(self.org_trust.iter()
                    .filter(|(_, &v)| v.abs() > 0.15)
                    .map(|(k, &v)| (k[..k.len().min(8)].to_string(), (v * 100.0).round() / 100.0))
                    .collect())
            } else { None },
            memory_count: if include_cold {
                Some(MemoryCount {
                    food:   self.food_memory.len(),
                    water:  self.water_memory.len(),
                    danger: self.danger_memory.len(),
                })
            } else { None },
            has_reflected:       if include_cold { Some(self.has_reflected) }       else { None },
            last_invention_tick: if include_cold { Some(self.last_invention_tick) } else { None },
            loneliness:          if include_cold { Some((self.loneliness * 100.0).round() / 100.0) } else { None },
            boredom:             if include_cold { Some((self.boredom    * 100.0).round() / 100.0) } else { None },
            comfort:             if include_cold { Some((self.comfort    * 100.0).round() / 100.0) } else { None },
            grief_ticks:         if include_cold { Some(self.grief_ticks) }         else { None },
            sleep_debt:          if include_cold { Some((self.sleep_debt * 100.0).round() / 100.0) } else { None },
            children_count:      if include_cold { Some(self.children_count) }      else { None },
            conversation_count:  if include_cold { Some(self.conversations.len()) } else { None },

            name:       if include_cold { Some(self.name.clone())       } else { None },
            generation: if include_cold { Some(self.generation)         } else { None },
            parent_id:  if include_cold { Some(self.parent_id.clone())  } else { None },
            father_id:  if include_cold { Some(self.father_id.clone())  } else { None },
            lineage_id: if include_cold { Some(self.lineage_id.clone()) } else { None },
            max_age:    if include_cold { Some(self.max_age)            } else { None },
            sex:        if include_cold { Some(self.sex.as_str().to_string()) } else { None },
            traits:     if include_cold {
                Some(TraitsJson {
                    curiosity:       (self.traits.curiosity       * 100.0).round() / 100.0,
                    aggression:      (self.traits.aggression      * 100.0).round() / 100.0,
                    fear:            (self.traits.fear            * 100.0).round() / 100.0,
                    memory_strength: (self.traits.memory_strength * 100.0).round() / 100.0,
                    social_tendency: (self.traits.social_tendency * 100.0).round() / 100.0,
                    resilience:      (self.traits.resilience      * 100.0).round() / 100.0,
                })
            } else { None },
            vocabulary:  if include_cold { Some(self.vocabulary.as_hashmap()) } else { None },
            discoveries: if include_cold { Some(self.discoveries.iter().cloned().collect()) } else { None },
            home_x:      if include_cold { Some((self.home_x * 10.0).round() / 10.0) } else { None },
            home_y:      if include_cold { Some((self.home_y * 10.0).round() / 10.0) } else { None },
            is_elder:    if include_cold { Some(self.is_elder) } else { None },
            friends:     if include_cold && !self.friends.is_empty() {
                Some(self.friends.clone())
            } else { None },
            attributes:  if include_cold && !self.attributes.is_empty() {
                let mut v: Vec<String> = self.attributes.iter().cloned().collect();
                v.sort();
                Some(v)
            } else { None },
            anchor_events: if include_cold && !self.anchor_events.is_empty() {
                Some(self.anchor_events.clone())
            } else { None },
            tools: if include_cold && !self.tools.is_empty() {
                Some(self.tools.clone())
            } else { None },
            home_furniture: if include_cold && !self.home_furniture.is_empty() {
                Some(self.home_furniture.clone())
            } else { None },
            home_style_seed: if include_cold && self.home_style_seed > 0 {
                Some(self.home_style_seed)
            } else { None },
        }
    }

    pub fn to_detail_json(&self) -> OrgDetailJson {
        let thought_history: Vec<ThoughtJson> = self.thought_history
            .iter().rev().take(20).rev()
            .map(|e| ThoughtJson { tick: e.tick, text: e.text.clone() })
            .collect();
        let life_log: Vec<LifeEventJson> = self.life_log.iter()
            .map(|e| LifeEventJson {
                tick:         e.tick,
                category:     e.category.clone(),
                text:         e.text.clone(),
                related_id:   e.related_id.clone(),
                related_name: e.related_name.clone(),
            })
            .collect();
        OrgDetailJson {
            base:            self.to_json(),
            thought_history,
            vocabulary:      self.vocabulary.as_hashmap(),
            daily_story:     self.daily_story.clone(),
            life_log,
            conversations:   self.conversations.iter().rev().take(25).rev().cloned().collect(),
        }
    }

    pub fn to_life_json(&self) -> OrgLifeJson {
        let events: Vec<LifeEventJson> = self.life_log.iter()
            .map(|e| LifeEventJson {
                tick:         e.tick,
                category:     e.category.clone(),
                text:         e.text.clone(),
                related_id:   e.related_id.clone(),
                related_name: e.related_name.clone(),
            })
            .collect();

        let friend_names: Vec<String> = self.friends.values().cloned().collect();
        let partner_id = self.partner_id.clone();
        let discoveries: Vec<String> = self.discoveries.iter().cloned().collect();

        let emotional_state = if self.grief_ticks > 50 { "devastated" }
            else if self.grief_ticks > 0 { "grieving" }
            else if self.loneliness > 0.75 { "desperately lonely" }
            else if self.fear_level > 0.65 { "terrified" }
            else if self.loneliness > 0.50 { "lonely" }
            else if self.comfort > 0.80 { "content" }
            else if self.boredom > 0.65 { "restless" }
            else if self.energy < 0.25 { "starving" }
            else { "stable" };

        OrgLifeJson {
            id:              self.id.clone(),
            name:            self.name.clone(),
            age_ticks:       self.age,
            generation:      self.generation,
            lineage_id:      self.lineage_id.clone(),
            sex:             self.sex.as_str().to_string(),
            alive:           self.alive,
            is_elder:        self.is_elder,
            partner_id,
            children_count:  self.children_count,
            friends:         friend_names,
            discoveries,
            emotional_state: emotional_state.to_string(),
            events,
            thought_history: self.thought_history.iter()
                .map(|e| ThoughtJson { tick: e.tick, text: e.text.clone() })
                .collect(),
        }
    }
}

#[derive(Serialize)] pub struct ThoughtJson { pub tick: u64, pub text: String }
#[derive(Serialize)] pub struct MemoryCount  { pub food: usize, pub water: usize, pub danger: usize }

#[derive(Serialize)]
pub struct LifeEventJson {
    pub tick:         u64,
    pub category:     String,
    pub text:         String,
    #[serde(skip_serializing_if = "Option::is_none")] pub related_id:   Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub related_name: Option<String>,
}

#[derive(Serialize)]
pub struct OrgLifeJson {
    pub id:              String,
    pub name:            String,
    pub age_ticks:       u32,
    pub generation:      u32,
    pub lineage_id:      String,
    pub sex:             String,
    pub alive:           bool,
    pub is_elder:        bool,
    pub partner_id:      Option<String>,
    pub children_count:  u32,
    pub friends:         Vec<String>,
    pub discoveries:     Vec<String>,
    pub emotional_state: String,
    pub events:          Vec<LifeEventJson>,
    pub thought_history: Vec<ThoughtJson>,
}

/// Hot Structure-of-Arrays payload for delta (viewport) frames.
///
/// Ages and other slow-moving cold fields are *not* included here -
/// full frames carry ground truth for those and the client preserves
/// them across deltas. Sending 4 bytes per org per tick for a counter
/// that increments by 1 was pure waste.
/// Hot Structure-of-Arrays payload for delta (viewport) frames.
///
/// Several historically per-org fields are now sparse or dropped to
/// cut bandwidth. Specifically:
/// - `alives` is gone - delta orgs are filtered to alive on the server
///   already, so every entry was `true`. Client merge keeps the
///   cached alive flag.
/// - `thoughts` is now sparse `Vec<(u32 index, String)>` - most ticks
///   the same thought repeats verbatim, so we only ship entries
///   whose `thought_dirty` flag was set since the last delta.
/// - `partner_ids` / `attracted_tos` are sparse `Vec<(u32, String)>`
///   too - only a small minority of orgs have either at any tick.
#[derive(Serialize)]
pub struct OrgsHotSoa {
    pub ids:            Vec<String>,
    pub xs:             Vec<i16>,
    pub ys:             Vec<i16>,
    pub vxs:            Vec<i16>,
    pub vys:            Vec<i16>,
    pub target_xs:      Vec<i16>,
    pub target_ys:      Vec<i16>,
    pub energies:       Vec<u8>,
    pub hydrations:     Vec<u8>,
    pub healths:        Vec<u8>,
    /// Sparse: (index into ids, thought text). Only orgs whose thought
    /// changed this tick. Client merges into prev cached thought.
    pub thoughts:       Vec<(u32, String)>,
    pub infections:     Vec<u8>,
    pub fear_levels:    Vec<u8>,
    pub carryings:      Vec<u8>,
    pub carrying_types: Vec<u8>,
    pub pregnants:      Vec<bool>,
    /// Sparse: (index into ids, partner_id). Absent → unpartnered.
    pub partner_ids:    Vec<(u32, String)>,
    /// Sparse: (index into ids, attracted_to id). Absent → no
    /// current attraction.
    pub attracted_tos:  Vec<(u32, String)>,
}

#[inline]
fn q_pos(v: f32) -> i16 {
    (v * 10.0).round().clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

#[inline]
fn q_pct(v: f32) -> u8 {
    (v * 100.0).round().clamp(0.0, 100.0) as u8
}

impl OrgsHotSoa {
    pub fn with_capacity(n: usize) -> Self {
        OrgsHotSoa {
            ids:            Vec::with_capacity(n),
            xs:             Vec::with_capacity(n),
            ys:             Vec::with_capacity(n),
            vxs:            Vec::with_capacity(n),
            vys:            Vec::with_capacity(n),
            target_xs:      Vec::with_capacity(n),
            target_ys:      Vec::with_capacity(n),
            energies:       Vec::with_capacity(n),
            hydrations:     Vec::with_capacity(n),
            healths:        Vec::with_capacity(n),
            // Sparse fields start empty - only allocate slots actually used.
            thoughts:       Vec::with_capacity(n / 4),
            infections:     Vec::with_capacity(n),
            fear_levels:    Vec::with_capacity(n),
            carryings:      Vec::with_capacity(n),
            carrying_types: Vec::with_capacity(n),
            pregnants:      Vec::with_capacity(n),
            partner_ids:    Vec::with_capacity(n / 8),
            attracted_tos:  Vec::with_capacity(n / 16),
        }
    }

    pub fn push(&mut self, o: &mut Organism, lookahead_ticks: f32) {
        let pred_x = o.x + o.vx_smooth * lookahead_ticks;
        let pred_y = o.y + o.vy_smooth * lookahead_ticks;
        // Velocity quantization: * 10 → i16, client decodes /10. Comment
        // and code were drifting at 10× off; standardising on /10 means
        // ±3276.7 tiles/tick representable, plenty of headroom.
        let enc_vx = (o.vx_smooth * 10.0).round().clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        let enc_vy = (o.vy_smooth * 10.0).round().clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        // i16::MIN sentinel = no target
        let (enc_tx, enc_ty) = match o.wander_target {
            Some((tx, ty)) => (tx as i16, ty as i16),
            None           => (i16::MIN, i16::MIN),
        };
        let idx = self.ids.len() as u32;
        self.ids.push(o.id.clone());
        self.xs.push(q_pos(pred_x));
        self.ys.push(q_pos(pred_y));
        self.vxs.push(enc_vx);
        self.vys.push(enc_vy);
        self.target_xs.push(enc_tx);
        self.target_ys.push(enc_ty);
        self.energies.push(q_pct(o.energy));
        self.hydrations.push(q_pct(o.hydration));
        self.healths.push(q_pct(o.health));
        // Sparse: only emit thought if dirty since last send. Clear
        // the flag after read so the next delta only ships subsequent
        // changes. Full frames take the AoS JSON path and don't
        // touch this flag (they emit the thought unconditionally).
        if o.thought_dirty {
            self.thoughts.push((idx, o.thought.clone()));
            o.thought_dirty = false;
        }
        self.infections.push(q_pct(o.infection));
        self.fear_levels.push(q_pct(o.fear_level));
        self.carryings.push(o.carrying.min(255) as u8);
        self.carrying_types.push(o.carrying_type);
        self.pregnants.push(o.pregnant);
        // Sparse: only emit when set.
        if let Some(pid) = &o.partner_id {
            self.partner_ids.push((idx, pid.clone()));
        }
        if let Some(aid) = &o.attracted_to {
            self.attracted_tos.push((idx, aid.clone()));
        }
    }
}
#[derive(Serialize)] pub struct TraitsJson   {
    pub curiosity: f32, pub aggression: f32, pub fear: f32,
    pub memory_strength: f32, pub social_tendency: f32, pub resilience: f32,
}
#[derive(Serialize)]
pub struct OrgJson {
    pub id: String,
    pub x: f32, pub y: f32,
    pub energy: f32, pub hydration: f32, pub health: f32,
    pub age: u32, pub alive: bool,
    pub thought: String,
    pub infection:     f32,
    pub fear_level:    f32,
    pub carrying:      u32,
    pub carrying_type: u8,
    pub pregnant:      bool,
    pub partner_id:     Option<String>,
    pub attracted_to:   Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")] pub memory_count:        Option<MemoryCount>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub attitudes:           Option<HashMap<String, f32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub org_trust:           Option<HashMap<String, f32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub has_reflected:       Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub last_invention_tick: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub loneliness:          Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub boredom:             Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub comfort:             Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub grief_ticks:         Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub sleep_debt:          Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub children_count:      Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub conversation_count:  Option<usize>,

    #[serde(default, skip_serializing_if = "Option::is_none")] pub name:        Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub generation:  Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub parent_id:   Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub father_id:   Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub lineage_id:  Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub max_age:     Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub sex:         Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub traits:      Option<TraitsJson>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub vocabulary:  Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub discoveries: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub home_x:      Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub home_y:      Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub is_elder:    Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub friends:     Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub attributes:  Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub anchor_events: Option<Vec<(u64, String, f32)>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub tools:        Option<HashMap<String, u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub home_furniture: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub home_style_seed: Option<u32>,
}

#[derive(Serialize)]
pub struct OrgDetailJson {
    #[serde(flatten)]
    pub base:          OrgJson,
    pub thought_history: Vec<ThoughtJson>,
    pub vocabulary:      HashMap<String, String>,
    pub daily_story:     String,
    pub life_log:        Vec<LifeEventJson>,
    pub conversations:   Vec<ConversationEntry>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand::rngs::StdRng;

    #[test]
    fn compress_for_archive_clears_heavy_state_but_keeps_skeleton() {
        let mut rng = StdRng::seed_from_u64(0);
        let traits = Traits::random(&mut rng);
        let mut org = Organism::new(
            "abc12345".into(), "Testname".into(),
            10.0, 20.0,
            3, "parent99".into(), "lineage1".into(),
            5000, traits.clone(),
        );
        org.food_memory.insert((1, 1), 0.5);
        org.water_memory.insert((2, 2), 0.5);
        org.danger_memory.insert((3, 3), 0.5);
        org.q_table.insert("state".into(), vec![(0, 0.1), (1, 0.1), (2, 0.1)]);
        org.lineage_attitudes.insert("other".into(), 0.7);
        org.org_trust.insert("xyz".into(), 0.5);
        org.log_event("something happened".into());
        org.discoveries.insert("fire".into());
        org.father_id = Some("father77".into());
        org.alive = false;

        org.compress_for_archive();

        assert!(org.food_memory.is_empty());
        assert!(org.water_memory.is_empty());
        assert!(org.danger_memory.is_empty());
        assert!(org.q_table.is_empty());
        assert!(org.lineage_attitudes.is_empty());
        assert!(org.org_trust.is_empty());
        assert!(org.life_log.is_empty());
        assert!(org.discoveries.is_empty());
        assert_eq!(org.id,          "abc12345");
        assert_eq!(org.name,        "Testname");
        assert_eq!(org.lineage_id,  "lineage1");
        assert_eq!(org.parent_id,   "parent99");
        assert_eq!(org.father_id,   Some("father77".into()));
        assert_eq!(org.generation,  3);
        assert_eq!(org.max_age,     5000);
        assert_eq!(org.traits.aggression, traits.aggression);
    }

    #[test]
    fn compress_for_archive_skips_live_organisms() {
        let mut rng = StdRng::seed_from_u64(0);
        let traits = Traits::random(&mut rng);
        let mut org = Organism::new(
            "id".into(), "Live".into(), 0.0, 0.0,
            0, "".into(), "lin".into(), 5000, traits,
        );
        org.q_table.insert("s".into(), vec![(0, 0.0), (1, 0.0)]);
        org.alive = true;
        org.compress_for_archive();
        assert!(!org.q_table.is_empty());
    }

    #[test]
    fn hydrated_organisms_leave_water_instead_of_lingering() {
        let mut rng = StdRng::seed_from_u64(0);
        let traits = Traits::random(&mut rng);
        let mut grid = WorldGrid::new(1);
        grid.set(10, 10, Tile::Water);
        grid.set(11, 10, Tile::Grass);

        let mut org = Organism::new(
            "id".into(), "Swimmer".into(), 10.0, 10.0,
            0, "".into(), "lin".into(), 5000, traits,
        );
        org.hydration = 0.95;
        org.water_ticks = 8;

        let (action, thought) = org.choose_action(
            &grid, 100, 0.0, &[], false, 0, &mut rng, false, "", &[],
        );

        assert_eq!(DIRECTIONS[action], (1, 0));
        assert_eq!(thought.as_deref(), Some("swimming ashore"));
    }

    #[test]
    fn movement_toward_land_avoids_deep_water_step() {
        let mut rng = StdRng::seed_from_u64(0);
        let traits = Traits::random(&mut rng);
        let mut grid = WorldGrid::new(2);
        grid.set(10, 10, Tile::Grass);
        grid.set(11, 10, Tile::Water);
        let wi = WorldGrid::idx(11, 10);
        grid.depth[wi] = 0.9;

        let org = Organism::new(
            "id".into(), "Walker".into(), 10.0, 10.0,
            0, "".into(), "lin".into(), 5000, traits,
        );

        let action = org.toward((20, 10), &grid);
        assert_ne!(DIRECTIONS[action], (1, 0));
    }
}
