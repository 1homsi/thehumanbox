use super::Simulation;
use crate::sim::config::SEASON_LENGTH;

/// Most ticks one `advance` command runs. A season is 3,000 ticks, so the client sends several commands
/// in a row, keeping each one short enough that the simulation stays responsive between them.
const DEFAULT_CHUNK: u32 = 600;
const MAX_CHUNK: u32 = 600;

impl Simulation {
    /// Run the world forward toward the next season (`to` = "season") or the next year (`to` = "year")
    /// boundary, by at most `max_ticks` ticks (600 by default). Returns false for an unknown target or when
    /// no tick runs.
    pub(super) fn cmd_advance(&mut self, to: String, max_ticks: u32) -> bool {
        let period = match to.as_str() {
            "season" => SEASON_LENGTH,
            "year" => 4 * SEASON_LENGTH,
            _ => return false,
        };
        let chunk = if max_ticks == 0 {
            DEFAULT_CHUNK
        } else {
            max_ticks.min(MAX_CHUNK)
        };
        let now = self.tick_count;
        let boundary = (now / period + 1) * period;
        let steps = (boundary - now).min(u64::from(chunk));
        for _ in 0..steps {
            self.tick();
        }
        steps > 0
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::config::SEASON_LENGTH;
    use crate::sim::simulation::Simulation;

    #[test]
    fn advance_stops_at_the_season_boundary() {
        let mut sim = Simulation::new(6);
        sim.tick_count = SEASON_LENGTH - 10;
        assert!(sim.apply_command_json(r#"{"cmd":"advance","to":"season","max_ticks":600}"#));
        assert_eq!(
            sim.tick_count, SEASON_LENGTH,
            "ten ticks short of the boundary, it stops on it"
        );
    }

    #[test]
    fn advance_runs_one_chunk_when_the_boundary_is_far() {
        let mut sim = Simulation::new(6);
        let before = sim.tick_count;
        assert!(sim.apply_command_json(r#"{"cmd":"advance","to":"season","max_ticks":25}"#));
        assert_eq!(sim.tick_count, before + 25);
    }

    #[test]
    fn advance_refuses_an_unknown_target() {
        let mut sim = Simulation::new(6);
        let before = sim.tick_count;
        assert!(!sim.apply_command_json(r#"{"cmd":"advance","to":"century"}"#));
        assert_eq!(sim.tick_count, before);
    }
}
