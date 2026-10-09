use super::{Simulation, SANDBOX_ANIMAL_CAP};
use crate::organism::animal::{pick_dog_name, Animal, AnimalKind};
use crate::sim::world_events::push_event;
use crate::world::grid::{HEIGHT, WIDTH};

/// How long a cured tribe stays immune to the sickness it was cured of, in ticks.
const TRIBE_CURE_IMMUNITY: u64 = 6_000;

impl Simulation {
    /// Cures the whole tribe of the person nearest the click: every living member who is sick is cured
    /// (the same cure as the cure tool, for the whole tribe, not just the people in reach). Returns false
    /// when nobody is in reach, or nobody in their tribe is sick.
    pub(super) fn cmd_cure_tribe(&mut self, x: f32, y: f32) -> bool {
        let Some(i) = self.nearest_in_reach(x, y, 0.0) else {
            return false;
        };
        let lid = self.organisms[i].lineage_id.clone();
        if lid.is_empty() {
            return false;
        }
        let now = self.tick_count;
        let until = now + TRIBE_CURE_IMMUNITY;
        let mut cured = 0usize;
        for o in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == lid)
        {
            if o.infection <= 0.0 && o.diseases.is_empty() {
                continue;
            }
            for (disease, _) in o.diseases.drain(..) {
                o.disease_immunity.insert(disease, until);
            }
            o.infection = 0.0;
            o.health = o.health.max(0.6);
            o.think("the sickness lifted", now);
            cured += 1;
        }
        if cured == 0 {
            return false;
        }
        let name = self
            .lineage_names
            .get(&lid)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        push_event(
            &mut self.events,
            now,
            "bless",
            &name,
            &format!("the gods cured {cured} people of {name}, all at once"),
        );
        true
    }

    /// A guardian dog appears beside the person nearest the click and bonds to them: it keeps to them,
    /// the way a released dog does. Returns false when nobody is in reach or the world is full of animals.
    pub(super) fn cmd_guardian(&mut self, x: f32, y: f32) -> bool {
        let Some(i) = self.nearest_in_reach(x, y, 0.0) else {
            return false;
        };
        let alive = self.animals.iter().filter(|a| a.alive).count();
        if alive >= SANDBOX_ANIMAL_CAP {
            return false;
        }
        let owner = self.organisms[i].id.clone();
        let name = self.organisms[i].name.clone();
        let gx = (self.organisms[i].x + 1.0).clamp(2.0, WIDTH as f32 - 2.0);
        let gy = self.organisms[i].y.clamp(2.0, HEIGHT as f32 - 2.0);
        let id = self.next_animal_id;
        self.next_animal_id += 1;
        let mut dog = Animal::new(id, gx, gy, AnimalKind::Dog);
        dog.energy = 1.0;
        dog.bonded_org = Some(owner);
        dog.name = Some(pick_dog_name(&mut self.rng));
        self.animals.push(dog);
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "bless",
            &name,
            &format!("a guardian dog came to stand by {name}"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::organism::animal::AnimalKind;
    use crate::sim::simulation::Simulation;

    /// Only the listed people are alive; each is placed, given a tribe, and sick or well.
    fn people(sim: &mut Simulation, who: &[(f32, f32, &str, bool)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
            o.infection = 0.0;
        }
        for (k, &(x, y, lid, sick)) in who.iter().enumerate() {
            let o = &mut sim.organisms[k];
            o.alive = true;
            o.x = x;
            o.y = y;
            o.lineage_id = lid.to_string();
            o.health = 1.0;
            o.infection = if sick { 0.8 } else { 0.0 };
        }
    }

    #[test]
    fn curing_a_tribe_heals_every_sick_member_and_no_one_else() {
        let mut sim = Simulation::new(41);
        people(
            &mut sim,
            &[
                (20.0, 20.0, "LA", true),
                (120.0, 120.0, "LA", true),
                (21.0, 20.0, "LB", true),
            ],
        );
        assert!(sim.apply_command_json(r#"{"cmd":"cure_tribe","x":20.0,"y":20.0}"#));
        assert_eq!(sim.organisms[0].infection, 0.0);
        assert_eq!(sim.organisms[1].infection, 0.0, "a member far away is cured too");
        assert!(sim.organisms[2].infection > 0.5, "the other tribe stays sick");
    }

    #[test]
    fn curing_a_healthy_tribe_changes_nothing() {
        let mut sim = Simulation::new(41);
        people(&mut sim, &[(20.0, 20.0, "LA", false), (21.0, 20.0, "LA", false)]);
        assert!(!sim.apply_command_json(r#"{"cmd":"cure_tribe","x":20.0,"y":20.0}"#));
    }

    #[test]
    fn a_guardian_dog_bonds_to_the_person_nearest_the_click() {
        let mut sim = Simulation::new(42);
        people(&mut sim, &[(60.0, 60.0, "LA", false)]);
        let owner = sim.organisms[0].id.clone();
        let before = sim.animals.len();
        assert!(sim.apply_command_json(r#"{"cmd":"guardian","x":60.0,"y":60.0}"#));
        let dog = sim.animals.last().expect("a dog was summoned");
        assert_eq!(sim.animals.len(), before + 1);
        assert!(matches!(dog.kind, AnimalKind::Dog), "the guardian is a dog");
        assert_eq!(dog.bonded_org.as_deref(), Some(owner.as_str()));
        assert!(dog.name.is_some(), "the guardian has a name");
    }

    #[test]
    fn a_guardian_needs_someone_in_reach() {
        let mut sim = Simulation::new(42);
        people(&mut sim, &[(60.0, 60.0, "LA", false)]);
        let before = sim.animals.len();
        assert!(!sim.apply_command_json(r#"{"cmd":"guardian","x":200.0,"y":200.0}"#));
        assert_eq!(sim.animals.len(), before);
    }
}
