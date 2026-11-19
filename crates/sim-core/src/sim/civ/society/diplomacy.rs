use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::nations::Nation;
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
    pub nations_formed: u32,
    pub nations_dissolved: u32,
    pub nations_annexed: u32,
    pub unions: u32,
    pub protected: u32,
    pub secessions: u32,
    pub civil_wars: u32,
    pub successions: u32,
    pub new_dynasties: u32,
    pub royal_marriages: u32,
    pub claims_pressed: u32,
    pub succession_wars: u32,
    pub faith_converts: u32,
    pub shared_festivals: u32,
    pub role_changes: u32,
    pub role_buildings: u32,
    pub supply_sent: u32,
    pub supply_delivered: u32,
    pub supply_within: u32,
    pub supply_between: u32,
    pub supply_on_roads: u32,
    pub supply_units: [u32; 3],
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Diplomacy {
    #[serde(skip_serializing_if = "Relations::is_empty")]
    pub relations: Relations,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub wars: Vec<War>,
    pub next_war_id: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub nations: Vec<Nation>,
    pub next_nation_id: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub claims: Vec<crate::sim::civ::society::rulers::Claim>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub marriages: Vec<crate::sim::civ::society::rulers::RoyalMarriage>,
    #[serde(skip)]
    pub nation_of: BTreeMap<String, u32>,
    #[serde(skip)]
    pub stats: DiplomacyStats,
}

impl Diplomacy {
    pub fn is_empty(&self) -> bool {
        self.relations.is_empty()
            && self.wars.is_empty()
            && self.next_war_id == 0
            && self.nations.is_empty()
            && self.next_nation_id == 0
            && self.claims.is_empty()
            && self.marriages.is_empty()
    }
}
