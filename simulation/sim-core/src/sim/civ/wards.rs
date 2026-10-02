//! A god's ward over a place: for a season no raid or battle begins inside
//! it, the beasts that prowl its edge do not strike, and no plague spreads
//! within it or finds a way in. It is how a player
//! shields a tribe on the brink without killing anyone to do it.

use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use serde::{Deserialize, Serialize};

/// Ticks a ward holds: one season.
pub const WARD_TICKS: u64 = 3_000;
/// Widest a ward may be cast, in tiles.
pub const MAX_WARD_RADIUS: f32 = 20.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ward {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub cast: u64,
    pub until: u64,
}

impl Ward {
    pub fn covers(&self, x: f32, y: f32) -> bool {
        (x - self.x).hypot(y - self.y) <= self.radius
    }
}

impl Simulation {
    /// True when a standing ward covers (x, y).
    pub(crate) fn warded(&self, x: f32, y: f32) -> bool {
        let now = self.tick_count;
        self.wards.iter().any(|w| now < w.until && w.covers(x, y))
    }

    /// Cast a ward. Always succeeds; a new ward over an old one renews it.
    pub(crate) fn cast_ward(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let radius = if radius <= 0.0 {
            8.0
        } else {
            radius.min(MAX_WARD_RADIUS)
        };
        let now = self.tick_count;
        self.wards
            .retain(|w| !(w.covers(x, y) && (w.x - x).hypot(w.y - y) < radius * 0.5));
        self.wards.push(Ward {
            x,
            y,
            radius,
            cast: now,
            until: now + WARD_TICKS,
        });
        let sheltered: Vec<String> = {
            let mut tribes: Vec<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive && (o.x - x).hypot(o.y - y) <= radius)
                .map(|o| o.lineage_id.clone())
                .collect();
            tribes.sort();
            tribes.dedup();
            tribes
        };
        for o in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && (o.x - x).hypot(o.y - y) <= radius)
        {
            o.fear_level = (o.fear_level - 0.3).max(0.0);
            o.think("felt the gods' ward settle over us", now);
        }
        for lineage in sheltered {
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            push_event(&mut self.events, now, "life", &name, "rest under the gods' ward");
        }
        true
    }

    /// Battles about to begin inside a ward are turned away instead.
    pub(crate) fn turn_away_warded(
        &mut self,
        battles: Vec<crate::sim::civ::warfare::Battle>,
    ) -> Vec<crate::sim::civ::warfare::Battle> {
        if self.wards.is_empty() {
            return battles;
        }
        let now = self.tick_count;
        let (kept, turned): (Vec<_>, Vec<_>) = battles
            .into_iter()
            .partition(|b| !self.warded(b.location.0 as f32, b.location.1 as f32));
        for b in turned {
            let defender = b
                .defenders
                .first()
                .and_then(|l| self.lineage_names.get(l))
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            push_event(
                &mut self.events,
                now,
                "answered",
                "the gods' ward",
                &format!("turned an attack away from the {defender}"),
            );
        }
        kept
    }

    /// Drop wards that have run their course.
    pub(crate) fn tick_wards(&mut self) {
        let now = self.tick_count;
        self.wards.retain(|w| now < w.until);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::warfare::{Battle, BattleScale};

    fn raid_at(x: i32, y: i32) -> Battle {
        Battle {
            id: format!("raid-{x}-{y}"),
            attackers: vec!["raiders".into()],
            defenders: vec!["clan".into()],
            attacker_orgs: vec![],
            defender_orgs: vec![],
            scale: BattleScale::Skirmish,
            location: (x, y),
            started_tick: 0,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 3,
            initial_d: 3,
        }
    }

    #[test]
    fn a_ward_shelters_its_ground_for_a_season() {
        let mut sim = Simulation::new(51);
        sim.tick_count = 1_000;
        assert!(sim.apply_command_json(r#"{"cmd":"ward","x":100,"y":100,"radius":8}"#));
        assert!(sim.warded(104.0, 100.0));
        assert!(!sim.warded(120.0, 100.0), "the ward reached too far");
        sim.tick_count += WARD_TICKS;
        sim.tick_wards();
        assert!(!sim.warded(104.0, 100.0), "the ward never lifted");
        assert!(sim.wards.is_empty());
    }

    #[test]
    fn a_ward_turns_battles_away_and_lets_others_be() {
        let mut sim = Simulation::new(52);
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        sim.cast_ward(100.0, 100.0, 8.0);
        sim.events.clear();
        let kept = sim.turn_away_warded(vec![raid_at(102, 101), raid_at(200, 200)]);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].location, (200, 200));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "turned an attack away from the Ashfolk"));
    }

    #[test]
    fn a_ward_stops_a_plague_spreading_inside_it() {
        use crate::organism::organism::Organism;
        let mut sim = Simulation::new(54);
        sim.organisms.clear();
        for i in 0..2 {
            let mut o = Organism::new(
                format!("p{i}"),
                format!("p{i}"),
                100.0 + i as f32,
                100.0,
                0,
                String::new(),
                "clan".into(),
                20_000,
                Default::default(),
            );
            o.alive = true;
            o.age = 9_000;
            sim.organisms.push(o);
        }
        sim.organisms[0].diseases.push(("plague".to_string(), 0));
        let mut spread = false;
        for round in 0..400u64 {
            sim.tick_count = 1_000 + round;
            sim.organisms[1].diseases.clear();
            crate::sim::civ::civ_tick::tick_disease_spread_for_test(&mut sim);
            spread |= !sim.organisms[1].diseases.is_empty();
        }
        assert!(spread, "the plague never spread in the open");

        sim.cast_ward(100.0, 100.0, 8.0);
        for round in 0..400u64 {
            sim.tick_count = 1_000 + round;
            sim.organisms[1].diseases.clear();
            crate::sim::civ::civ_tick::tick_disease_spread_for_test(&mut sim);
            assert!(
                sim.organisms[1].diseases.is_empty(),
                "the plague crossed the ward"
            );
        }
    }

    #[test]
    fn a_ward_survives_a_save() {
        let mut sim = Simulation::new(53);
        sim.cast_ward(50.0, 60.0, 10.0);
        let json = serde_json::to_string(&sim.to_save_state()).unwrap();
        let state = serde_json::from_str(&json).unwrap();
        let restored = Simulation::from_save(53, state);
        assert!(restored.warded(52.0, 60.0));
    }
}
