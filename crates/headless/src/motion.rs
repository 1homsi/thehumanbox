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
    day_ticks: u64,
    day_walking: u64,
    day_working: u64,
    day_resting: u64,
    day_standing: u64,
    day_at_ease: u64,
}

fn at_ease(sim: &Simulation, o: &sim_core::organism::organism::Organism, here: (i32, i32)) -> bool {
    use sim_core::sim::agents::routine::{Activity, Group};
    let Some(r) = o.routine.as_ref() else {
        return false;
    };
    let activity = r.activity_at(sim.tick_count % 600);
    match (r.group, activity) {
        (Group::Infant, _) | (_, Activity::Meal) => true,
        (Group::Elder, Activity::Sit) => r
            .place_of(activity)
            .is_some_and(|p| (p.0 - here.0).abs().max((p.1 - here.1).abs()) <= 6),
        _ => false,
    }
}

impl Motion {
    pub(super) fn observe(&mut self, sim: &Simulation) {
        let day = !sim.is_night();
        for o in sim.organisms.iter().filter(|o| o.alive) {
            let here = (o.x as i32, o.y as i32);
            if day {
                let moved = self.last.get(o.id.as_str()).is_some_and(|w| w.at != here);
                self.day_ticks += 1;
                match o.last_action {
                    _ if moved => self.day_walking += 1,
                    Some(17) => self.day_resting += 1,
                    Some(action) if action >= 8 => self.day_working += 1,
                    _ if at_ease(sim, o, here) => self.day_at_ease += 1,
                    _ => self.day_standing += 1,
                }
            }
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
            let step = ((here.0 - walker.at.0).signum(), (here.1 - walker.at.1).signum());
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
        let open = self.last.values().filter(|w| w.run > 0);
        let runs = self.runs + open.clone().count() as u64;
        let run_steps = self.run_steps + open.map(|w| u64::from(w.run)).sum::<u64>();
        println!(
            "motion:      {} steps, {:.1}% straight back, mean straight run {:.2} steps",
            self.steps,
            pct(self.reversals),
            run_steps as f64 / runs.max(1) as f64
        );
        let share = |n: u64| 100.0 * n as f64 / self.day_ticks.max(1) as f64;
        println!(
            "daytime:     {:.1}% walking, {:.1}% at a task, {:.1}% resting, {:.1}% standing with nothing to do, {:.1}% at ease (a meal, elders sitting, infants)",
            share(self.day_walking),
            share(self.day_working),
            share(self.day_resting),
            share(self.day_standing),
            share(self.day_at_ease)
        );
    }
}
