use super::Simulation;
use crate::math::DetMath;
use crate::sim::world_events::push_event;
use rand::RngExt;

/// How far from the click a person may be and still be the one changed, in tiles.
const DEFAULT_REACH: f32 = 4.0;
const MAX_REACH: f32 = 16.0;
/// How much a mutation raises one trait of its own (traits are capped at 1).
const MUTATION_GAIN: f32 = 0.5;
/// What a curse does to the cursed person.
const CURSE_HEALTH: f32 = 0.25;
const CURSE_FEAR: f32 = 0.5;
const CURSE_INFECTION: f32 = 0.5;

impl Simulation {
    /// The living person nearest the point (within the reach) gains a mutation: one of their traits
    /// (curiosity, aggression, fear, memory, sociability or resilience) jumps, chosen at random. The
    /// change is written into the chronicle. Returns false when nobody is in reach.
    pub(super) fn cmd_mutate(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let Some(i) = self.nearest_in_reach(x, y, radius) else {
            return false;
        };
        let pick = self.rng.random_range(0..6u8);
        let trait_name = {
            let t = &mut self.organisms[i].traits;
            let (value, name) = match pick {
                0 => (&mut t.curiosity, "curiosity"),
                1 => (&mut t.aggression, "aggression"),
                2 => (&mut t.fear, "fear"),
                3 => (&mut t.memory_strength, "memory"),
                4 => (&mut t.social_tendency, "sociability"),
                _ => (&mut t.resilience, "resilience"),
            };
            *value = (*value + MUTATION_GAIN).min(1.0);
            name
        };
        let name = self.organisms[i].name.clone();
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "mutation",
            &name,
            &format!("mutated: their {trait_name} grew far beyond anyone else's"),
        );
        true
    }

    /// A curse falls on the living person nearest the point (within the reach): they are frightened,
    /// hurt and fall sick. Returns false when nobody is in reach.
    pub(super) fn cmd_curse(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let Some(i) = self.nearest_in_reach(x, y, radius) else {
            return false;
        };
        let person = &mut self.organisms[i];
        person.health -= CURSE_HEALTH;
        person.fear_level = (person.fear_level + CURSE_FEAR).min(1.0);
        person.infection = person.infection.max(CURSE_INFECTION);
        let name = person.name.clone();
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "curse",
            &name,
            "was cursed: bad luck, fear and sickness fell on them",
        );
        true
    }

    /// The living person nearest the point, if any is within the reach (default four tiles, sixteen at most).
    pub(super) fn nearest_in_reach(&self, x: f32, y: f32, radius: f32) -> Option<usize> {
        if !x.is_finite() || !y.is_finite() {
            return None;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_REACH)
        } else {
            DEFAULT_REACH
        };
        self.organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, _)| i)
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    fn only_person_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = x;
        sim.organisms[0].y = y;
        sim.organisms[0].health = 1.0;
        sim.organisms[0].infection = 0.0;
        sim.organisms[0].fear_level = 0.0;
    }

    #[test]
    fn a_mutation_raises_one_trait_of_the_nearest_person_in_reach() {
        let mut sim = Simulation::new(12);
        only_person_at(&mut sim, 80.0, 80.0);
        let values = |sim: &Simulation| {
            let t = &sim.organisms[0].traits;
            [
                t.curiosity,
                t.aggression,
                t.fear,
                t.memory_strength,
                t.social_tendency,
                t.resilience,
            ]
        };
        let before = values(&sim);
        assert!(sim.apply_command_json(r#"{"cmd":"mutate","x":80.0,"y":80.0}"#));
        let after = values(&sim);
        assert_ne!(before, after, "one of the traits changed");
        for v in after {
            assert!((0.0..=1.0).contains(&v), "traits stay within 0 and 1: {v}");
        }
    }

    #[test]
    fn a_curse_hurts_frightens_and_sickens_the_person_under_it() {
        let mut sim = Simulation::new(12);
        only_person_at(&mut sim, 80.0, 80.0);
        assert!(sim.apply_command_json(r#"{"cmd":"curse","x":80.0,"y":80.0}"#));
        assert!(sim.organisms[0].health < 1.0);
        assert!(sim.organisms[0].fear_level > 0.4);
        assert!(sim.organisms[0].infection >= 0.5);
    }

    #[test]
    fn mutation_and_curse_need_someone_in_reach() {
        let mut sim = Simulation::new(12);
        only_person_at(&mut sim, 80.0, 80.0);
        assert!(!sim.apply_command_json(r#"{"cmd":"mutate","x":10.0,"y":10.0}"#));
        assert!(!sim.apply_command_json(r#"{"cmd":"curse","x":10.0,"y":10.0}"#));
        assert_eq!(sim.organisms[0].health, 1.0, "the far person is unchanged");
    }
}
