//! The gods can raise someone who has only just died. It is the surest way
//! to save a tribe's last mother, and it has to be earned by haste and
//! restraint: only the dead of the last season answer the call, nobody
//! whose time simply ran out, and a tribe is raised for only once a season.

use crate::math::DetMath;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// How long after dying someone can still be raised.
pub const REVIVE_WINDOW: u64 = 3_000;
/// Ticks before the same tribe can be raised for again.
pub const REVIVE_COOLDOWN: u64 = 3_000;
/// How far from the point the dead may lie, in tiles.
const REACH: f32 = 4.0;

impl Simulation {
    /// Raise the nearest person who died within the window and the reach.
    /// False when there is no one to raise, or the tribe was raised for lately.
    pub(crate) fn revive_near(&mut self, x: f32, y: f32) -> bool {
        let now = self.tick_count;
        let candidate = self
            .fallen
            .iter()
            .filter(|(_, died)| now.saturating_sub(*died) <= REVIVE_WINDOW)
            .filter_map(|(id, _)| {
                self.organisms.iter().position(|o| &o.id == id).filter(|&i| {
                    let o = &self.organisms[i];
                    !o.alive && (o.max_age == 0 || o.age < o.max_age)
                })
            })
            .map(|i| (i, (self.organisms[i].x - x).det_hypot(self.organisms[i].y - y)))
            .filter(|&(_, d)| d <= REACH)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let Some((i, _)) = candidate else {
            return false;
        };
        let lineage = self.organisms[i].lineage_id.clone();
        if self
            .revive_cooldown
            .get(&lineage)
            .is_some_and(|&t| now.saturating_sub(t) < REVIVE_COOLDOWN)
        {
            return false;
        }
        let o = &mut self.organisms[i];
        o.alive = true;
        o.health = 0.6;
        o.energy = o.energy.max(0.6);
        o.hydration = o.hydration.max(0.6);
        o.infection = 0.0;
        o.fear_level = 0.0;
        o.think("returned from death by the gods", now);
        let name = o.name.clone();
        let id = o.id.clone();
        self.fallen.retain(|(f, _)| f != &id);
        self.revive_cooldown.insert(lineage.clone(), now);
        // A miracle: the tribe's faith in its gods grows.
        self.adjust_faith(&lineage, 2);
        let tribe = self
            .lineage_names
            .get(&lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut self.events,
            now,
            "answered",
            &tribe,
            &format!("{name} was raised from the dead by the gods"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn dead_person(sim: &mut Simulation, id: &str, age: u32, died: u64) {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            50.0,
            50.0,
            0,
            String::new(),
            "clan".into(),
            20_000,
            Default::default(),
        );
        o.alive = false;
        o.age = age;
        o.health = 0.0;
        sim.organisms.push(o);
        sim.fallen.push_back((id.into(), died));
    }

    fn world() -> Simulation {
        let mut sim = Simulation::new(66);
        sim.organisms.clear();
        sim.events.clear();
        sim.tick_count = 10_000;
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        sim
    }

    #[test]
    fn someone_who_just_died_can_be_raised_once_a_season() {
        let mut sim = world();
        dead_person(&mut sim, "mum", 9_000, 9_500);
        dead_person(&mut sim, "dad", 9_000, 12_900);
        let faith = sim.prayers.faith.get("clan").copied().unwrap_or(0);
        assert!(sim.apply_command_json(r#"{"cmd":"revive","x":50.0,"y":50.0}"#));
        assert_eq!(sim.organisms.iter().filter(|o| o.alive).count(), 1);
        let raised = sim.organisms.iter().find(|o| o.alive).unwrap();
        assert!(raised.health > 0.5 && raised.energy >= 0.6);
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.ends_with("was raised from the dead by the gods")));
        assert_eq!(sim.prayers.faith.get("clan").copied().unwrap_or(0), faith + 2);
        // The same tribe is not raised for again within the season.
        assert!(!sim.apply_command_json(r#"{"cmd":"revive","x":50.0,"y":50.0}"#));
        sim.tick_count += REVIVE_COOLDOWN;
        assert!(sim.apply_command_json(r#"{"cmd":"revive","x":50.0,"y":50.0}"#));
    }

    #[test]
    fn the_long_dead_the_far_and_those_whose_time_ran_out_stay_dead() {
        let mut sim = world();
        dead_person(&mut sim, "ancient", 9_000, 1_000);
        dead_person(&mut sim, "elder", 20_000, 9_900);
        assert!(!sim.apply_command_json(r#"{"cmd":"revive","x":50.0,"y":50.0}"#));
        dead_person(&mut sim, "far", 9_000, 9_900);
        sim.organisms.last_mut().unwrap().x = 90.0;
        assert!(!sim.apply_command_json(r#"{"cmd":"revive","x":50.0,"y":50.0}"#));
        assert!(sim.organisms.iter().all(|o| !o.alive));
    }

    #[test]
    fn deaths_are_remembered_as_they_happen() {
        let mut sim = Simulation::new(67);
        let i = sim.organisms.iter().position(|o| o.alive).unwrap();
        let id = sim.organisms[i].id.clone();
        sim.organisms[i].health = -1.0;
        for _ in 0..30 {
            sim.tick();
            if !sim.organisms[i].alive {
                break;
            }
            sim.organisms[i].health = -1.0;
        }
        assert!(sim.fallen.iter().any(|(f, _)| f == &id));
    }
}
