use super::*;

pub const SAVE_SCHEMA_VERSION: u32 = 5;

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
    /// Worth the player's attention (see `world_events::is_news`). The log's
    /// "important" view shows exactly these, so the sim and the client never
    /// disagree about what matters.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub news: bool,
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
    /// Killed by wolves, bears or monsters.
    pub deaths_beasts: u64,
    pub deaths_drowning: u64,
    pub deaths_fire: u64,
    /// Earthquakes, meteors, floods, storms, volcanoes, collapsing roofs.
    pub deaths_disaster: u64,
    pub sickness_events: u64,
    pub alliances_formed: u64,
    pub challenges_total: u64,
    pub gifts_total: u64,
    pub droughts: u64,
    pub outbreaks: u64,
    #[serde(default)]
    pub era_history: VecDeque<EraEntry>,
}

/// Read-mostly lineage facts collected once at the start of every tick.
/// Civilization systems previously re-counted and re-centred the same
/// populations independently; this keeps those scheduled decisions cheap and
/// internally consistent for the tick.
#[derive(Default, Clone, Copy)]
pub(crate) struct LineageAggregate {
    pub population: usize,
    pub x_sum: f32,
    pub y_sum: f32,
    pub literacy_sum: f32,
    pub energy_sum: f32,
}

impl LineageAggregate {
    pub fn center(self) -> (i32, i32) {
        if self.population == 0 {
            return (0, 0);
        }
        (
            (self.x_sum / self.population as f32) as i32,
            (self.y_sum / self.population as f32) as i32,
        )
    }

    pub fn literacy(self) -> f32 {
        if self.population == 0 {
            0.0
        } else {
            self.literacy_sum / self.population as f32
        }
    }
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct EraEntry {
    pub tick: u64,
    pub era: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StrategyObjective {
    pub strategy: String,
    pub started_tick: u64,
    pub expires_tick: u64,
    pub progress: u32,
    pub target: u32,
    pub completed_tick: Option<u64>,
    pub failed_tick: Option<u64>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StrategyCampaignRecord {
    pub lineage_id: String,
    pub lineage_name: String,
    pub strategy: String,
    pub started_tick: u64,
    pub ended_tick: u64,
    pub progress: u32,
    pub target: u32,
    pub outcome: String,
    pub reason: Option<String>,
}
