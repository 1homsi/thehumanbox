use super::outcome::Report;
use super::Command;
use crate::sim::simulation::Simulation;

pub const MAX_COMPOSITE_STEPS: usize = 8;

impl Simulation {
    pub(super) fn cmd_composite(&mut self, steps: Vec<Command>) -> bool {
        let nested = steps.iter().any(|step| matches!(step, Command::Composite { .. }));
        if steps.is_empty() || steps.len() > MAX_COMPOSITE_STEPS || nested {
            return false;
        }
        let mut last = None;
        for step in steps {
            let outcome = self.apply_command_reported(step);
            if outcome.applied {
                last = Some(outcome);
            }
        }
        let Some(outcome) = last else { return false };
        self.command_report = Some(Report {
            code: outcome.code,
            count: outcome.count,
            name: outcome.name,
            buildings: outcome.buildings,
            tribe: outcome.tribe,
            homes: outcome.homes,
        });
        true
    }
}
