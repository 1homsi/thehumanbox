use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::relations::Relations;
use crate::sim::civ::warfare::War;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DiplomacyStats {
    pub wars_by_reason: BTreeMap<&'static str, u32>,
    pub outcomes: BTreeMap<&'static str, u32>,
    pub allies_joined: u32,
    pub relief_shipments: u32,
    pub relief_food: u32,
    pub tribute_shipments: u32,
    pub towns_ceded: u32,
    pub raids: u32,
    pub front_battles: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Diplomacy {
    #[serde(skip_serializing_if = "Relations::is_empty")]
    pub relations: Relations,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub wars: Vec<War>,
    pub next_war_id: u32,
    #[serde(skip)]
    pub stats: DiplomacyStats,
}

impl Diplomacy {
    pub fn is_empty(&self) -> bool {
        self.relations.is_empty() && self.wars.is_empty() && self.next_war_id == 0
    }
}
