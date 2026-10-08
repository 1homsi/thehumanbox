use super::Simulation;
use crate::sim::config::DAY_LENGTH;
use crate::sim::world_events::push_event;

impl Simulation {
    /// Move the clock forward to the next dawn, noon, dusk or midnight. The clock only runs forward, so
    /// nothing that was scheduled for a later tick is stranded, and the season and year stay where they
    /// are (season and year lengths are whole days). Returns false for an unknown phase.
    pub(super) fn cmd_set_time_of_day(&mut self, phase: String) -> bool {
        let (fraction, when) = match phase.as_str() {
            "dawn" => (0.0, "dawn breaks"),
            "noon" => (0.25, "the sun stands at noon"),
            "dusk" => (0.6, "dusk falls"),
            "midnight" => (0.85, "it is the dead of night"),
            _ => return false,
        };
        let offset = (fraction * DAY_LENGTH as f64) as u64;
        let day_start = self.tick_count - self.tick_count % DAY_LENGTH;
        let mut target = day_start + offset;
        if target < self.tick_count {
            target += DAY_LENGTH;
        }
        self.tick_count = target;
        push_event(&mut self.events, target, "time", "world", when);
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::config::{DAY_LENGTH, SEASON_LENGTH};
    use crate::sim::simulation::Simulation;

    #[test]
    fn time_of_day_moves_the_clock_forward_to_the_named_phase() {
        let mut sim = Simulation::new(7);
        sim.tick_count = DAY_LENGTH * 3 + 100;
        assert!(sim.apply_command_json(r#"{"cmd":"set_time_of_day","phase":"noon"}"#));
        assert_eq!(sim.tick_count, DAY_LENGTH * 3 + DAY_LENGTH / 4);
        assert!(!sim.is_night());

        sim.tick_count = DAY_LENGTH * 3 + 100;
        assert!(sim.apply_command_json(r#"{"cmd":"set_time_of_day","phase":"dawn"}"#));
        assert_eq!(
            sim.tick_count,
            DAY_LENGTH * 4,
            "dawn already passed today, so it is tomorrow's"
        );
    }

    #[test]
    fn midnight_is_night_and_the_season_does_not_change() {
        let mut sim = Simulation::new(7);
        sim.tick_count = SEASON_LENGTH * 2 + DAY_LENGTH * 5 + 10;
        let season = sim.season();
        assert!(sim.apply_command_json(r#"{"cmd":"set_time_of_day","phase":"midnight"}"#));
        assert!(sim.is_night());
        assert_eq!(sim.season(), season);
    }

    #[test]
    fn an_unknown_phase_changes_nothing() {
        let mut sim = Simulation::new(7);
        sim.tick_count = 1234;
        assert!(!sim.apply_command_json(r#"{"cmd":"set_time_of_day","phase":"teatime"}"#));
        assert_eq!(sim.tick_count, 1234);
    }
}
