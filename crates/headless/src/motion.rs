use sim_core::sim::simulation::Simulation;
use std::collections::HashMap;

struct Walker {
    at: (i32, i32),
    heading: (i32, i32),
    run: u32,
}

#[derive(Default)]
pub(super) struct Motion {
    last: HashMap<String, Walker>,
    steps: u64,
    reversals: u64,
    runs: u64,
    run_steps: u64,
}

impl Motion {
    pub(super) fn observe(&mut self, sim: &Simulation) {
        for o in sim.organisms.iter().filter(|o| o.alive) {
            let here = (o.x as i32, o.y as i32);
            let Some(walker) = self.last.get_mut(o.id.as_str()) else {
                self.last.insert(
                    o.id.to_string(),
                    Walker {
                        at: here,
                        heading: (0, 0),
                        run: 0,
                    },
                );
                continue;
            };
            let heading = walker.heading;
            let step = (here.0 - walker.at.0, here.1 - walker.at.1);
            if step == (0, 0) {
                continue;
            }
            self.steps += 1;
            if heading != (0, 0) && step == (-heading.0, -heading.1) {
                self.reversals += 1;
            }
            walker.at = here;
            if step == heading {
                walker.run += 1;
            } else {
                if walker.run > 0 {
                    self.runs += 1;
                    self.run_steps += u64::from(walker.run);
                }
                walker.heading = step;
                walker.run = 1;
            }
        }
    }

    pub(super) fn print(&self) {
        let pct = |n: u64| 100.0 * n as f64 / self.steps.max(1) as f64;
        println!(
            "motion:      {} steps, {:.1}% straight back, mean straight run {:.2} steps",
            self.steps,
            pct(self.reversals),
            self.run_steps as f64 / self.runs.max(1) as f64
        );
    }
}
