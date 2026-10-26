//! Each tribe's own history, for its card: raids and wars, ages reached, famines, arrivals and splits,
//! crafts learned, and leaders lost, each with the place it happened.
//!
//! This is for the player to read. No part of the world reads it, and it is not in the save, so a loaded
//! game starts the history afresh. Every entry is written where the world already decides the event.

use super::Simulation;
use crate::sim::warfare::{Battle, BattleScale};
use std::collections::{BTreeMap, VecDeque};

/// Entries kept for each tribe; the oldest go first.
pub const KEEP_PER_TRIBE: usize = 40;
/// Tribes that keep a history at once; the one whose last entry is oldest goes first.
pub const KEEP_TRIBES: usize = 64;

#[derive(Clone, Debug, PartialEq)]
pub struct ChronicleEntry {
    pub tick: u64,
    /// `raid`, `war`, `era`, `famine`, `arrival`, `split`, `craft` or `leader_died`.
    pub kind: &'static str,
    /// The other tribe in a raid, war or split.
    pub other: Option<String>,
    /// An era, craft or leader's name, where the kind has one.
    pub word: Option<String>,
    /// Where it happened, in tiles.
    pub place: Option<(i32, i32)>,
}

#[derive(Clone, Debug, Default)]
pub struct TribeChronicle {
    by_tribe: BTreeMap<String, VecDeque<ChronicleEntry>>,
}

impl TribeChronicle {
    pub fn record(&mut self, lineage: &str, entry: ChronicleEntry) {
        if !self.by_tribe.contains_key(lineage) && self.by_tribe.len() >= KEEP_TRIBES {
            let quietest = self
                .by_tribe
                .iter()
                .min_by_key(|(_, entries)| entries.back().map_or(0, |e| e.tick))
                .map(|(lid, _)| lid.clone());
            if let Some(lid) = quietest {
                self.by_tribe.remove(&lid);
            }
        }
        let entries = self.by_tribe.entry(lineage.to_string()).or_default();
        entries.push_back(entry);
        while entries.len() > KEEP_PER_TRIBE {
            entries.pop_front();
        }
    }

    /// Every tribe's history, oldest entry first.
    pub fn tribes(&self) -> impl Iterator<Item = (&str, &VecDeque<ChronicleEntry>)> {
        self.by_tribe.iter().map(|(lid, entries)| (lid.as_str(), entries))
    }
}

impl Simulation {
    /// Writes one entry into a tribe's history. An empty lineage id is no tribe, so nothing is written.
    pub(crate) fn chronicle(
        &mut self,
        lineage: &str,
        kind: &'static str,
        other: Option<&str>,
        word: Option<&str>,
        place: Option<(i32, i32)>,
    ) {
        if lineage.is_empty() {
            return;
        }
        let entry = ChronicleEntry {
            tick: self.tick_count,
            kind,
            other: other.map(str::to_string),
            word: word.map(str::to_string),
            place,
        };
        self.tribe_chronicle.record(lineage, entry);
    }

    /// Where a tribe's home was first found, for entries that happen to the tribe as a whole.
    pub(crate) fn chronicle_home(&self, lineage: &str) -> Option<(i32, i32)> {
        self.lineage_homes.get(lineage).map(|h| (h[0], h[1]))
    }

    /// Leaders a battle just killed get a `leader_died` entry. Battle deaths skip the mortality phase that
    /// writes it for other deaths. `standing` is who was alive before the battles were fought.
    pub(crate) fn record_fallen_leaders(&mut self, standing: &[bool]) {
        let fallen: Vec<(String, String, (i32, i32))> = self
            .organisms
            .iter()
            .zip(standing)
            .filter(|(o, &was)| was && !o.alive && o.is_leader)
            .map(|(o, _)| {
                (
                    o.lineage_id.clone(),
                    o.name.clone(),
                    (o.x.round() as i32, o.y.round() as i32),
                )
            })
            .collect();
        for (lineage, name, place) in fallen {
            self.chronicle(&lineage, "leader_died", None, Some(&name), Some(place));
        }
    }

    /// A battle that has just begun: each side's history names the other and the place.
    pub(crate) fn chronicle_battle(&mut self, battle: &Battle) {
        let kind = if matches!(battle.scale, BattleScale::Raid) {
            "raid"
        } else {
            "war"
        };
        let place = Some(battle.location);
        for a in &battle.attackers {
            for d in &battle.defenders {
                self.chronicle(a, kind, Some(d), None, place);
                self.chronicle(d, kind, Some(a), None, place);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(tick: u64) -> ChronicleEntry {
        ChronicleEntry {
            tick,
            kind: "era",
            other: None,
            word: Some("iron".into()),
            place: Some((3, 4)),
        }
    }

    #[test]
    fn each_tribe_keeps_only_its_latest_entries() {
        let mut c = TribeChronicle::default();
        for tick in 0..(KEEP_PER_TRIBE as u64 + 5) {
            c.record("a", entry(tick));
        }
        let (_, kept) = c.tribes().next().expect("a has a history");
        assert_eq!(kept.len(), KEEP_PER_TRIBE);
        assert_eq!(kept.front().map(|e| e.tick), Some(5));
    }

    #[test]
    fn the_quietest_tribe_gives_way_when_too_many_keep_histories() {
        let mut c = TribeChronicle::default();
        for i in 0..KEEP_TRIBES {
            c.record(&format!("t{i:03}"), entry(100 + i as u64));
        }
        c.record("late", entry(500));
        let names: Vec<&str> = c.tribes().map(|(lid, _)| lid).collect();
        assert_eq!(names.len(), KEEP_TRIBES);
        assert!(
            !names.contains(&"t000"),
            "the tribe whose last entry was oldest is dropped"
        );
        assert!(names.contains(&"late"));
    }

    #[test]
    fn a_leader_who_falls_in_battle_is_written_into_the_history() {
        let mut sim = Simulation::new(42);
        sim.organisms[0].alive = true;
        let standing: Vec<bool> = sim.organisms.iter().map(|o| o.alive).collect();
        {
            let o = &mut sim.organisms[0];
            o.is_leader = true;
            o.lineage_id = "fallen".into();
            o.name = "Ana".into();
            o.x = 10.4;
            o.y = 20.6;
            o.alive = false;
        }
        sim.record_fallen_leaders(&standing);
        let (_, entries) = sim
            .tribe_chronicle
            .tribes()
            .find(|(lid, _)| *lid == "fallen")
            .expect("the fallen leader's tribe has a history");
        let entry = entries.back().expect("the leader's death is written");
        assert_eq!(entry.kind, "leader_died");
        assert_eq!(entry.word.as_deref(), Some("Ana"));
        assert_eq!(entry.place, Some((10, 21)));
    }

    #[test]
    fn a_nameless_tribe_writes_nothing() {
        let mut sim = Simulation::new(42);
        sim.chronicle("", "famine", None, None, None);
        assert_eq!(sim.tribe_chronicle.tribes().count(), 0);
    }
}
