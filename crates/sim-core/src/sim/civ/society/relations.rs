use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryKind {
    Trade,
    Gift,
    Relief,
    Marriage,
    Aid,
    Peace,
    Raid,
    BattleWon,
    BattleLost,
    Betrayal,
    Border,
    LandTaken,
    Tribute,
}

impl MemoryKind {
    pub fn name(self) -> &'static str {
        match self {
            MemoryKind::Trade => "trade",
            MemoryKind::Gift => "gift",
            MemoryKind::Relief => "relief",
            MemoryKind::Marriage => "marriage",
            MemoryKind::Aid => "aid",
            MemoryKind::Peace => "peace",
            MemoryKind::Raid => "raid",
            MemoryKind::BattleWon => "battle_won",
            MemoryKind::BattleLost => "battle_lost",
            MemoryKind::Betrayal => "betrayal",
            MemoryKind::Border => "border",
            MemoryKind::LandTaken => "land_taken",
            MemoryKind::Tribute => "tribute",
        }
    }

    fn daily_keep(self) -> f32 {
        match self {
            MemoryKind::Border => 0.891,
            MemoryKind::Gift => 0.917,
            MemoryKind::Trade | MemoryKind::Tribute => 0.933,
            MemoryKind::BattleWon => 0.955,
            MemoryKind::Raid => 0.966,
            MemoryKind::BattleLost => 0.973,
            MemoryKind::Marriage | MemoryKind::Peace | MemoryKind::Aid => 0.977,
            MemoryKind::Relief => 0.983,
            MemoryKind::Betrayal => 0.9885,
            MemoryKind::LandTaken => 0.9931,
        }
    }

    fn limit(self) -> f32 {
        match self {
            MemoryKind::Gift | MemoryKind::BattleWon => 0.15,
            MemoryKind::Border => 0.3,
            MemoryKind::Trade | MemoryKind::Peace | MemoryKind::Tribute => 0.35,
            MemoryKind::Marriage | MemoryKind::Aid => 0.4,
            MemoryKind::Relief | MemoryKind::BattleLost | MemoryKind::Betrayal => 0.7,
            MemoryKind::Raid | MemoryKind::LandTaken => 0.9,
        }
    }

    pub fn is_grievance(self) -> bool {
        matches!(
            self,
            MemoryKind::Raid
                | MemoryKind::BattleLost
                | MemoryKind::Betrayal
                | MemoryKind::LandTaken
                | MemoryKind::Tribute
        )
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Memory {
    pub kind: MemoryKind,
    pub weight: f32,
    pub tick: u64,
    #[serde(default)]
    pub count: u32,
}

const FORGOTTEN: f32 = 0.01;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct LedgerRow {
    holder: String,
    other: String,
    memory: Vec<Memory>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(from = "Vec<LedgerRow>", into = "Vec<LedgerRow>")]
pub struct Relations {
    ledger: BTreeMap<(String, String), Vec<Memory>>,
}

impl From<Vec<LedgerRow>> for Relations {
    fn from(rows: Vec<LedgerRow>) -> Self {
        let mut ledger = BTreeMap::new();
        for row in rows {
            if row.holder.is_empty() || row.other.is_empty() || row.holder == row.other {
                continue;
            }
            let memory: Vec<Memory> = row.memory.into_iter().filter(|m| m.weight.is_finite()).collect();
            if !memory.is_empty() {
                ledger.insert((row.holder, row.other), memory);
            }
        }
        Relations { ledger }
    }
}

impl From<Relations> for Vec<LedgerRow> {
    fn from(relations: Relations) -> Self {
        relations
            .ledger
            .into_iter()
            .map(|((holder, other), memory)| LedgerRow {
                holder,
                other,
                memory,
            })
            .collect()
    }
}

impl Relations {
    pub fn is_empty(&self) -> bool {
        self.ledger.is_empty()
    }

    pub fn len(&self) -> usize {
        self.ledger.len()
    }

    pub fn remember(&mut self, holder: &str, other: &str, kind: MemoryKind, delta: f32, tick: u64) {
        if holder.is_empty() || other.is_empty() || holder == other || !delta.is_finite() {
            return;
        }
        let limit = kind.limit();
        let memory = self
            .ledger
            .entry((holder.to_string(), other.to_string()))
            .or_default();
        match memory.iter_mut().find(|m| m.kind == kind) {
            Some(m) => {
                m.weight = (m.weight + delta).clamp(-limit, limit);
                m.tick = tick;
                m.count = m.count.saturating_add(1);
            }
            None => {
                memory.push(Memory {
                    kind,
                    weight: delta.clamp(-limit, limit),
                    tick,
                    count: 1,
                });
                memory.sort_by_key(|m| m.kind);
            }
        }
    }

    pub fn memories(&self, holder: &str, other: &str) -> &[Memory] {
        self.ledger
            .get(&(holder.to_string(), other.to_string()))
            .map_or(&[], Vec::as_slice)
    }

    pub fn standing(&self, holder: &str, other: &str) -> f32 {
        self.memories(holder, other)
            .iter()
            .map(|m| m.weight)
            .sum::<f32>()
            .clamp(-1.0, 1.0)
    }

    pub fn weight(&self, holder: &str, other: &str, kind: MemoryKind) -> f32 {
        self.memories(holder, other)
            .iter()
            .find(|m| m.kind == kind)
            .map_or(0.0, |m| m.weight)
    }

    pub fn count(&self, holder: &str, other: &str, kind: MemoryKind) -> u32 {
        self.memories(holder, other)
            .iter()
            .find(|m| m.kind == kind)
            .map_or(0, |m| m.count)
    }

    pub fn grievance(&self, holder: &str, other: &str) -> f32 {
        -self
            .memories(holder, other)
            .iter()
            .filter(|m| m.kind.is_grievance())
            .map(|m| m.weight.min(0.0))
            .sum::<f32>()
    }

    pub fn others_of<'a>(&'a self, holder: &'a str) -> impl Iterator<Item = &'a str> + 'a {
        self.ledger
            .range((holder.to_string(), String::new())..)
            .take_while(move |((h, _), _)| h == holder)
            .map(|((_, other), _)| other.as_str())
    }

    pub fn fade(&mut self) {
        self.ledger.retain(|_, memory| {
            memory.retain_mut(|m| {
                m.weight *= m.kind.daily_keep();
                m.weight.abs() >= FORGOTTEN
            });
            !memory.is_empty()
        });
    }

    pub fn forget_gone(&mut self, living: &BTreeSet<String>) {
        self.ledger
            .retain(|(holder, other), _| living.contains(holder) && living.contains(other));
    }

    pub fn rename(&mut self, from: &str, to: &str) {
        if from == to {
            return;
        }
        let moved: Vec<((String, String), Vec<Memory>)> = self
            .ledger
            .iter()
            .filter(|((h, o), _)| h == from || o == from)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        for ((h, o), memory) in moved {
            self.ledger.remove(&(h.clone(), o.clone()));
            let h = if h == from { to.to_string() } else { h };
            let o = if o == from { to.to_string() } else { o };
            if h == o {
                continue;
            }
            for m in memory {
                self.remember(&h, &o, m.kind, m.weight, m.tick);
            }
        }
    }
}

pub const MOOD_SHARE: f32 = 0.7;

impl Simulation {
    pub(crate) fn remember(&mut self, holder: &str, other: &str, kind: MemoryKind, delta: f32) {
        self.diplomacy
            .relations
            .remember(holder, other, kind, delta, self.tick_count);
    }

    pub(crate) fn remember_both(&mut self, a: &str, b: &str, kind: MemoryKind, delta: f32) {
        self.remember(a, b, kind, delta);
        self.remember(b, a, kind, delta);
    }

    pub(crate) fn opinion_with_mood(&self, holder: &str, other: &str, mood: f32) -> f32 {
        (self.diplomacy.relations.standing(holder, other) + MOOD_SHARE * mood).clamp(-1.0, 1.0)
    }

    pub(crate) fn tick_relations(&mut self) {
        if self.tick_count % DAY_LENGTH != DAY_LENGTH / 4 {
            return;
        }
        self.diplomacy.relations.fade();
        let living: BTreeSet<String> = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| o.lineage_id.clone())
            .collect();
        self.diplomacy.relations.forget_gone(&living);
        let gifts = std::mem::take(&mut self.history.tribe_gifts);
        for (giver, taker) in gifts {
            if living.contains(&giver) && living.contains(&taker) {
                self.remember(&taker, &giver, MemoryKind::Gift, 0.02);
            }
        }
        let quarrels = std::mem::take(&mut self.history.tribe_quarrels);
        for (wronged, wrongdoer) in quarrels {
            if living.contains(&wronged)
                && living.contains(&wrongdoer)
                && !self.same_side(&wronged, &wrongdoer)
            {
                self.remember(&wronged, &wrongdoer, MemoryKind::Border, -0.02);
            }
        }
        for (a, b) in self.border_contacts() {
            if living.contains(&a) && living.contains(&b) && !self.same_side(&a, &b) {
                self.remember(&a, &b, MemoryKind::Border, -0.02);
            }
        }
    }

    pub(crate) fn border_contacts(&self) -> BTreeSet<(String, String)> {
        let mut contacts: BTreeSet<(String, String)> = BTreeSet::new();
        let mut lineages: Vec<&String> = self.territory.keys().collect();
        lineages.sort();
        for lid in lineages {
            let Some(tiles) = self.territory.get(lid) else {
                continue;
            };
            let mut seen: BTreeSet<&str> = BTreeSet::new();
            for &(x, y) in tiles {
                for (dx, dy) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)] {
                    if let Some(owner) = self.tile_owner.get(&(x + dx, y + dy)) {
                        if owner != lid {
                            seen.insert(owner.as_str());
                        }
                    }
                }
            }
            for other in seen {
                contacts.insert((lid.clone(), other.to_string()));
                contacts.insert((other.to_string(), lid.clone()));
            }
        }
        contacts
    }

    pub(crate) fn seed_relations_from_treaties(&mut self) {
        if !self.diplomacy.relations.is_empty() {
            return;
        }
        use crate::sim::civ::warfare::TreatyKind;
        let tick = self.tick_count;
        let treaties = self.treaties.clone();
        for t in treaties.iter().filter(|t| t.expires_tick > tick) {
            let (kind, weight) = match t.kind {
                TreatyKind::Alliance | TreatyKind::Defensive => (MemoryKind::Peace, 0.25),
                TreatyKind::Trade => (MemoryKind::Trade, 0.15),
                TreatyKind::NonAggression => (MemoryKind::Peace, 0.1),
                TreatyKind::Vassalage => (MemoryKind::Tribute, -0.1),
            };
            self.diplomacy
                .relations
                .remember(&t.lineage_a, &t.lineage_b, kind, weight, tick);
            self.diplomacy
                .relations
                .remember(&t.lineage_b, &t.lineage_a, kind, weight, tick);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memories_add_up_within_their_limit_and_fade_by_kind() {
        let mut r = Relations::default();
        for _ in 0..10 {
            r.remember("a", "b", MemoryKind::Raid, -0.25, 10);
        }
        assert!((r.weight("a", "b", MemoryKind::Raid) + 0.9).abs() < 1e-6);
        assert_eq!(r.count("a", "b", MemoryKind::Raid), 10);
        r.remember("a", "b", MemoryKind::Border, -0.2, 10);
        r.remember("a", "b", MemoryKind::LandTaken, -0.5, 10);
        assert_eq!(r.standing("a", "b"), -1.0);
        assert_eq!(r.standing("b", "a"), 0.0);
        for _ in 0..40 {
            r.fade();
        }
        assert_eq!(r.weight("a", "b", MemoryKind::Border), 0.0);
        let raid = r.weight("a", "b", MemoryKind::Raid);
        let land = r.weight("a", "b", MemoryKind::LandTaken);
        assert!(raid > -0.3 && raid < -0.15, "raid {raid}");
        assert!(land < -0.37, "land {land}");
        assert!((r.grievance("a", "b") + raid + land).abs() < 1e-6);
    }

    #[test]
    fn the_ledger_round_trips_and_forgets_the_gone() {
        let mut r = Relations::default();
        r.remember("a", "b", MemoryKind::Trade, 0.1, 5);
        r.remember("b", "a", MemoryKind::Relief, 0.3, 6);
        r.remember("c", "a", MemoryKind::Marriage, 0.05, 7);
        let json = serde_json::to_string(&r).expect("serialises");
        let back: Relations = serde_json::from_str(&json).expect("deserialises");
        assert_eq!(back, r);
        let living: BTreeSet<String> = ["a".to_string(), "b".to_string()].into();
        let mut kept = back;
        kept.forget_gone(&living);
        assert_eq!(kept.len(), 2);
        assert_eq!(kept.others_of("b").collect::<Vec<_>>(), vec!["a"]);
    }

    #[test]
    fn a_tribe_that_carries_on_under_another_name_keeps_its_memories() {
        let mut r = Relations::default();
        r.remember("old", "x", MemoryKind::Raid, -0.3, 1);
        r.remember("x", "old", MemoryKind::Trade, 0.1, 1);
        r.rename("old", "new");
        assert!(r.weight("new", "x", MemoryKind::Raid) < -0.29);
        assert!(r.weight("x", "new", MemoryKind::Trade) > 0.09);
        assert_eq!(r.memories("old", "x").len(), 0);
    }
}
