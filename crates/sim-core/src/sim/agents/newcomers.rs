//! People the player sends into the world arrive ready to live: young
//! adults, fed and rested, in couples when they come as a group, and of
//! whichever sex a tribe they join has run out of. Before this every
//! "new tribe" was five orphaned infants, and a single newcomer to a tribe
//! with no mothers left was as likely as not another man.

use crate::organism::organism::Sex;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::RngExt;

impl Simulation {
    /// Sexes for `n` newcomers to `lineage`: alternating for a group so it
    /// pairs into couples; for one person joining a tribe, the sex its
    /// adults lack, if it lacks one.
    pub(crate) fn newcomer_sexes(&mut self, lineage: &str, n: u32) -> Vec<Option<Sex>> {
        if n != 1 {
            let first = Sex::random(&mut self.rng);
            let other = match first {
                Sex::Male => Sex::Female,
                Sex::Female => Sex::Male,
            };
            return (0..n)
                .map(|i| Some(if i % 2 == 0 { first } else { other }))
                .collect();
        }
        let (mut women, mut men) = (0u32, 0u32);
        for o in self
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
        {
            if AgeStage::from_age(o.age, o.max_age).can_reproduce() {
                match o.sex {
                    Sex::Female => women += 1,
                    Sex::Male => men += 1,
                }
            }
        }
        let needed = match (women, men) {
            (0, m) if m > 0 => Some(Sex::Female),
            (w, 0) if w > 0 => Some(Sex::Male),
            _ => None,
        };
        vec![needed]
    }

    /// The world's first people are a band, not a nursery: mostly young
    /// adults who can raise families from the start, with some children and
    /// youths among them.
    pub(crate) fn grow_founders(&mut self, first: usize) {
        for i in first..self.organisms.len() {
            // Young adults, with their families still ahead of them.
            let span = if self.rng.random::<f32>() < 0.75 {
                self.rng.random_range(0.35f32..0.42)
            } else {
                self.rng.random_range(0.14f32..0.3)
            };
            let o = &mut self.organisms[i];
            o.age = (o.max_age as f32 * span) as u32;
        }
    }

    /// Ready everyone spawned from `first` on: grown, fed and healthy, and
    /// tell the tribe they joined, if they joined one.
    pub(crate) fn welcome_newcomers(&mut self, first: usize, lineage: &str) {
        let now = self.tick_count;
        let joined = self.organisms[..first]
            .iter()
            .any(|o| o.alive && o.lineage_id == lineage);
        for i in first..self.organisms.len() {
            let span = self.rng.random_range(0.35f32..0.42);
            let o = &mut self.organisms[i];
            o.age = (o.max_age as f32 * span) as u32;
            o.energy = o.energy.max(0.85);
            o.hydration = o.hydration.max(0.85);
            o.health = o.health.max(0.95);
            o.think(
                if joined {
                    "sent by the gods to a new home"
                } else {
                    "woke in a strange land, with the others"
                },
                now,
            );
        }
        let arrived = self.organisms.len() - first;
        if joined && arrived > 0 {
            let name = self
                .lineage_names
                .get(lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            let detail = if arrived == 1 {
                "welcomed a newcomer sent by the gods".to_string()
            } else {
                format!("welcomed {arrived} newcomers sent by the gods")
            };
            push_event(&mut self.events, now, "life", &name, &detail);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn man(id: usize, lineage: &str) -> Organism {
        let mut o = Organism::new(
            format!("m{id}"),
            format!("m{id}"),
            100.0,
            100.0,
            0,
            String::new(),
            lineage.to_string(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o.age = 9_000;
        o.sex = Sex::Male;
        o
    }

    #[test]
    fn a_new_tribe_arrives_as_grown_couples_not_infants() {
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100,"y":100,"count":6}"#));
        assert_eq!(sim.organisms.len(), 6);
        for o in &sim.organisms {
            assert_eq!(
                AgeStage::from_age(o.age, o.max_age),
                AgeStage::Adult,
                "age {} of {}",
                o.age,
                o.max_age
            );
            assert!(o.energy >= 0.85 && o.health >= 0.95);
        }
        let women = sim.organisms.iter().filter(|o| o.sex == Sex::Female).count();
        assert_eq!(women, 3, "a group should pair into couples");
        let lineage = &sim.organisms[0].lineage_id;
        assert!(sim.organisms.iter().all(|o| &o.lineage_id == lineage));
    }

    #[test]
    fn the_first_people_are_a_band_of_mostly_grown_adults() {
        let sim = Simulation::new(7);
        let adults = sim
            .organisms
            .iter()
            .filter(|o| AgeStage::from_age(o.age, o.max_age) == AgeStage::Adult)
            .count();
        let infants = sim
            .organisms
            .iter()
            .filter(|o| AgeStage::from_age(o.age, o.max_age) == AgeStage::Infant)
            .count();
        assert!(
            adults * 2 > sim.organisms.len(),
            "{adults} adults of {}",
            sim.organisms.len()
        );
        assert_eq!(infants, 0, "the world began as a nursery");
    }

    #[test]
    fn a_tribe_of_men_is_sent_a_woman() {
        let mut sim = Simulation::new(6);
        sim.organisms.clear();
        for i in 0..3 {
            sim.organisms.push(man(i, "clan"));
        }
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        sim.events.clear();
        for _ in 0..5 {
            let before = sim.organisms.len();
            assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":101,"y":100,"count":1}"#));
            let newcomer = &sim.organisms[before];
            assert_eq!(
                newcomer.lineage_id, "clan",
                "the newcomer did not join the tribe beside them"
            );
            assert_eq!(newcomer.sex, Sex::Female);
            // Undo, so every round starts from a tribe of men.
            sim.organisms.truncate(before);
        }
        assert!(sim
            .events
            .iter()
            .any(|e| e.actor == "Ashfolk" && e.detail == "welcomed a newcomer sent by the gods"));
    }
}
