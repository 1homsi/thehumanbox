//! A tribe remembers the winter it went hungry. Every death by starvation in
//! winter deepens the memory; each autumn after, the tribe lays food by and
//! sends more of its people out to gather, whatever the elders' omen says.
//! The memory fades a little each year, so a tribe that has eaten well for a
//! generation grows careless again, until the next hungry winter.
//!
//! The memory is kept per tribe and saved with the world.

use crate::sim::config::SEASON_LENGTH;
use crate::sim::cosmos::current_year;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use serde::{Deserialize, Serialize};

/// How much one death by starvation in winter adds to the memory.
const PER_DEATH: f32 = 0.3;
/// How much of the memory is lost each year it is not renewed.
const YEARLY_FADE: f32 = 0.15;
/// Below this the tribe no longer acts on the memory.
pub const REMEMBERED: f32 = 0.2;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct WinterMemory {
    /// How vividly the tribe remembers, 0 to 1.
    pub strength: f32,
    /// The year of the worst winter they remember.
    pub year: u64,
}

impl Simulation {
    /// Called when someone starves: in winter, their tribe will remember it.
    pub(crate) fn remember_hungry_winter(&mut self, lineage: &str) {
        if self.season() != "scarcity" || lineage.is_empty() {
            return;
        }
        let year = current_year(self.tick_count);
        let memory = self.lineage_winter_memory.entry(lineage.to_string()).or_default();
        memory.strength = (memory.strength + PER_DEATH).min(1.0);
        memory.year = year;
    }

    /// How vividly `lineage` remembers a hungry winter (0 when it does not).
    pub(crate) fn winter_memory(&self, lineage: &str) -> f32 {
        self.lineage_winter_memory
            .get(lineage)
            .map_or(0.0, |m| m.strength)
    }

    /// At the start of each autumn: memories fade a little, and every tribe that
    /// still remembers says so as it begins to lay food by.
    pub(crate) fn tick_winter_memories(&mut self) {
        let into_year = self.tick_count % (SEASON_LENGTH * 4);
        if into_year != SEASON_LENGTH {
            return;
        }
        let tick = self.tick_count;
        let mut told: Vec<(String, u64)> = Vec::new();
        self.lineage_winter_memory.retain(|lineage, memory| {
            memory.strength -= YEARLY_FADE;
            if memory.strength >= REMEMBERED {
                told.push((lineage.clone(), memory.year));
            }
            memory.strength > 0.0
        });
        for (lineage, year) in told {
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            push_event(
                &mut self.events,
                tick,
                "life",
                &name,
                &format!("remember the hungry winter of year {} and lay food by", year + 1),
            );
            for o in self
                .organisms
                .iter_mut()
                .filter(|o| o.alive && o.lineage_id == lineage)
            {
                if o.is_elder {
                    o.think("telling of the hungry winter", tick);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn winter(sim: &mut Simulation) {
        sim.tick_count = SEASON_LENGTH * 2 + 10;
        assert_eq!(sim.season(), "scarcity");
    }

    #[test]
    fn a_winter_death_by_hunger_is_remembered_and_fades_over_the_years() {
        let mut sim = Simulation::new(3);
        winter(&mut sim);
        sim.remember_hungry_winter("clan");
        sim.remember_hungry_winter("clan");
        assert!((sim.winter_memory("clan") - 0.6).abs() < 1e-6);
        let mut years = 0;
        while sim.winter_memory("clan") >= REMEMBERED {
            years += 1;
            sim.tick_count = SEASON_LENGTH * 4 * years + SEASON_LENGTH;
            sim.tick_winter_memories();
        }
        assert!((2..=4).contains(&years), "remembered {years} years");
    }

    #[test]
    fn hunger_outside_winter_teaches_no_winter_lesson() {
        let mut sim = Simulation::new(3);
        sim.tick_count = 10;
        sim.remember_hungry_winter("clan");
        assert_eq!(sim.winter_memory("clan"), 0.0);
    }

    #[test]
    fn a_remembering_tribe_says_so_in_autumn() {
        let mut sim = Simulation::new(3);
        winter(&mut sim);
        for _ in 0..3 {
            sim.remember_hungry_winter("clan");
        }
        sim.lineage_names.insert("clan".into(), "the Reed folk".into());
        sim.tick_count = SEASON_LENGTH * 5;
        sim.tick_winter_memories();
        assert!(sim
            .events
            .iter()
            .any(|e| e.actor == "the Reed folk" && e.detail.contains("hungry winter of year 1")));
    }
}
