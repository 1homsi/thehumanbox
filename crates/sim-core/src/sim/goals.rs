//! Goals and difficulty for the player.
//!
//! Every world has two goals and one way to lose. Keep three tribes alive for
//! five years in a row (a tribe counts while it has at least eight living
//! people). Reach the Iron Age in any tribe. And the world is lost when no one
//! is left alive. Difficulty sets how hard the world is: a calm world has
//! fewer disasters and gentler hunger, a harsh one has more of both.

use crate::sim::cosmos::{DAY_LENGTH, YEAR_LENGTH_TICKS};
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Tribes that must stay alive for the survival goal.
pub const TRIBES_NEEDED: usize = 3;
/// Years in a row the tribes must stay alive.
pub const SURVIVAL_YEARS: u32 = 5;
/// Living people a tribe needs to count as alive.
const MIN_TRIBE: usize = 8;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Calm,
    #[default]
    Normal,
    Harsh,
}

impl Difficulty {
    pub fn name(self) -> &'static str {
        match self {
            Difficulty::Calm => "calm",
            Difficulty::Normal => "normal",
            Difficulty::Harsh => "harsh",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "calm" => Some(Difficulty::Calm),
            "normal" => Some(Difficulty::Normal),
            "harsh" => Some(Difficulty::Harsh),
            _ => None,
        }
    }

    /// Multiplies the energy a person loses to hunger each tick.
    pub fn hunger_mult(self) -> f32 {
        match self {
            Difficulty::Calm => 0.8,
            Difficulty::Normal => 1.0,
            Difficulty::Harsh => 1.3,
        }
    }

    /// Multiplies how often droughts, outbreaks and meteor showers begin.
    pub fn disaster_mult(self) -> f32 {
        match self {
            Difficulty::Calm => 0.5,
            Difficulty::Normal => 1.0,
            Difficulty::Harsh => 1.8,
        }
    }
}

/// The player's goals and how far they have got, saved with the world.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct GoalBook {
    #[serde(default)]
    pub difficulty: Difficulty,
    /// Consecutive years so far with at least `TRIBES_NEEDED` tribes alive.
    #[serde(default)]
    pub tribe_years: u32,
    #[serde(default)]
    pub survival_done_tick: Option<u64>,
    #[serde(default)]
    pub iron_done_tick: Option<u64>,
    /// The tick at which the last person died, once it has happened.
    #[serde(default)]
    pub lost_tick: Option<u64>,
}

/// One goal as the Goals panel shows it.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct GoalStatus {
    pub id: &'static str,
    pub title: String,
    pub progress: u32,
    pub target: u32,
    pub done: bool,
}

impl GoalBook {
    pub fn statuses(&self) -> Vec<GoalStatus> {
        vec![
            GoalStatus {
                id: "keep_three_tribes",
                title: format!("Keep {TRIBES_NEEDED} tribes alive for {SURVIVAL_YEARS} years"),
                progress: self.tribe_years.min(SURVIVAL_YEARS),
                target: SURVIVAL_YEARS,
                done: self.survival_done_tick.is_some(),
            },
            GoalStatus {
                id: "reach_iron_age",
                title: "Reach the Iron Age".to_string(),
                progress: u32::from(self.iron_done_tick.is_some()),
                target: 1,
                done: self.iron_done_tick.is_some(),
            },
        ]
    }
}

impl Simulation {
    /// Checks the goals: the lost state each day, the tribes and eras each year.
    pub(crate) fn tick_goals(&mut self) {
        let tick = self.tick_count;
        if tick == 0 {
            return;
        }
        if tick.is_multiple_of(DAY_LENGTH)
            && self.goals.lost_tick.is_none()
            && !self.organisms.iter().any(|o| o.alive)
        {
            self.goals.lost_tick = Some(tick);
        }
        if !tick.is_multiple_of(YEAR_LENGTH_TICKS) {
            return;
        }
        let mut people: BTreeMap<&str, usize> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            *people.entry(o.lineage_id.as_str()).or_insert(0) += 1;
        }
        let tribes = people.values().filter(|&&n| n >= MIN_TRIBE).count();
        if tribes >= TRIBES_NEEDED {
            self.goals.tribe_years += 1;
        } else {
            self.goals.tribe_years = 0;
        }
        if self.goals.tribe_years >= SURVIVAL_YEARS && self.goals.survival_done_tick.is_none() {
            self.goals.survival_done_tick = Some(tick);
        }
        if self.goals.iron_done_tick.is_none() && self.lineage_eras.values().any(|&e| e >= Era::Iron) {
            self.goals.iron_done_tick = Some(tick);
        }
    }

    pub fn difficulty(&self) -> Difficulty {
        self.goals.difficulty
    }

    pub fn set_difficulty(&mut self, level: Difficulty) {
        self.goals.difficulty = level;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn difficulty_names_round_trip_and_scale_in_order() {
        for d in [Difficulty::Calm, Difficulty::Normal, Difficulty::Harsh] {
            assert_eq!(Difficulty::parse(d.name()), Some(d));
        }
        assert_eq!(Difficulty::parse("nightmare"), None);
        assert!(Difficulty::Calm.hunger_mult() < Difficulty::Normal.hunger_mult());
        assert!(Difficulty::Normal.hunger_mult() < Difficulty::Harsh.hunger_mult());
        assert!(Difficulty::Calm.disaster_mult() < Difficulty::Harsh.disaster_mult());
        assert_eq!(Difficulty::default(), Difficulty::Normal);
    }

    #[test]
    fn three_tribes_for_five_years_completes_the_survival_goal() {
        let mut sim = Simulation::new(101);
        // Three tribes of eight living people each; everyone else is dead.
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = i < 3 * MIN_TRIBE;
            o.lineage_id = format!("tribe-{}", i / MIN_TRIBE);
        }
        for year in 1..=SURVIVAL_YEARS as u64 {
            sim.tick_count = year * YEAR_LENGTH_TICKS;
            sim.tick_goals();
        }
        assert_eq!(sim.goals.tribe_years, SURVIVAL_YEARS);
        assert!(sim.goals.survival_done_tick.is_some());
        assert!(sim.goals.statuses()[0].done);
    }

    #[test]
    fn losing_everyone_records_the_day_the_world_was_lost() {
        let mut sim = Simulation::new(103);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.tick_count = 4 * DAY_LENGTH;
        sim.tick_goals();
        assert_eq!(sim.goals.lost_tick, Some(4 * DAY_LENGTH));
    }

    #[test]
    fn the_difficulty_command_sets_the_level_and_unknown_names_are_refused() {
        use crate::sim::command::Command;
        let mut sim = Simulation::new(105);
        assert!(sim.apply_command(Command::SetDifficulty {
            level: "harsh".into(),
        }));
        assert_eq!(sim.difficulty(), Difficulty::Harsh);
        assert!(!sim.apply_command(Command::SetDifficulty {
            level: "nightmare".into(),
        }));
        assert_eq!(sim.difficulty(), Difficulty::Harsh);
    }
}
