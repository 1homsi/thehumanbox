use super::*;

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
    pub tick: u64,
    pub with_name: String,
    pub with_id: String,
    pub kind: String,
    pub lines: Vec<[String; 2]>,
    pub meanings: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id: String,
}

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
pub struct Journey {
    pub target: (i32, i32),
    pub description: String,
    pub expires_at: u64,
}

/// What can wound a person.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Harm {
    /// A brawl, duel or thrown stone between neighbours.
    Fight,
    /// Killed by a thief getting away with the goods (civ/society/crime.rs).
    Murder,
    /// Put to death by the state for a killing (civ/society/crime.rs).
    Execution,
    /// A battle between tribes at war.
    War,
    /// A wolf, bear or monster.
    Beast,
    Drowning,
    Fire,
    /// An earthquake, meteor, flood, blizzard, lightning, volcano or a
    /// collapsing building.
    Disaster,
    Sickness,
}

impl Harm {
    /// How the death is told, and the history column it counts in.
    pub fn name(self) -> &'static str {
        match self {
            Harm::Fight => "combat",
            Harm::Murder => "murder",
            Harm::Execution => "executed",
            Harm::War => "war",
            Harm::Beast => "beasts",
            Harm::Drowning => "drowning",
            Harm::Fire => "fire",
            Harm::Disaster => "disaster",
            Harm::Sickness => "sickness",
        }
    }
}

/// Ticks a wound stays the likely cause of a death that follows it.
pub const HARM_MEMORY: u64 = 1_200;
