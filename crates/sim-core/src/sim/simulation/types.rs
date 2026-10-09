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
    /// Births and deaths in each year of the calendar (index 0 is the first
    /// year), for the stats panel. Counted where `births` and the death
    /// causes are counted; they never change what happens in the world.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub births_by_year: Vec<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deaths_by_year: Vec<u32>,
}

impl History {
    /// Counts a birth in the year `tick` falls in.
    pub fn record_birth(&mut self, tick: u64) {
        bump_year(&mut self.births_by_year, tick);
    }

    /// Counts a death in the year `tick` falls in.
    pub fn record_death(&mut self, tick: u64) {
        bump_year(&mut self.deaths_by_year, tick);
    }
}

fn bump_year(years: &mut Vec<u32>, tick: u64) {
    let year = (tick / crate::sim::cosmos::YEAR_LENGTH_TICKS) as usize;
    if years.len() <= year {
        years.resize(year + 1, 0);
    }
    years[year] = years[year].saturating_add(1);
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

#[cfg(test)]
mod history_year_tests {
    use super::*;
    use crate::sim::cosmos::YEAR_LENGTH_TICKS;

    #[test]
    fn births_and_deaths_are_counted_in_the_year_they_happen() {
        let mut h = History::default();
        h.record_birth(0);
        h.record_birth(YEAR_LENGTH_TICKS - 1);
        h.record_birth(YEAR_LENGTH_TICKS);
        h.record_death(3 * YEAR_LENGTH_TICKS + 5);
        assert_eq!(h.births_by_year, vec![2, 1]);
        assert_eq!(h.deaths_by_year, vec![0, 0, 0, 1]);
    }

    #[test]
    fn a_run_counts_every_birth_in_some_year() {
        let mut sim = Simulation::new(42);
        for _ in 0..(YEAR_LENGTH_TICKS + 500) {
            sim.tick();
        }
        assert!(sim.history.births > 0);
        let counted: u64 = sim.history.births_by_year.iter().map(|&n| u64::from(n)).sum();
        assert_eq!(counted, sim.history.births, "every birth lands in a year");
        let deaths: u64 = sim.history.deaths_by_year.iter().map(|&n| u64::from(n)).sum();
        assert!(
            deaths > 0
                && deaths
                    <= sim.history.deaths_old_age
                        + sim.history.deaths_starvation
                        + sim.history.deaths_dehydration
                        + sim.history.deaths_sickness
                        + sim.history.deaths_beasts
                        + sim.history.deaths_drowning
                        + sim.history.deaths_fire
                        + sim.history.deaths_disaster
                        + sim.history.deaths_combat
        );
    }
}
