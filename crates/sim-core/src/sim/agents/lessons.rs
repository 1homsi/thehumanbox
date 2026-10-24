//! Taking a lesson from a death (see `organism::lessons`). Those who saw it
//! happen learn from it, close kin most of all; kin far away who only heard of
//! it learn a little.

use crate::organism::lessons::{Lesson, FROM_KIN, FROM_NEIGHBOUR};
use crate::sim::age_stage::AgeStage;
use crate::sim::simulation::Simulation;

/// How close someone has to be to have seen a death.
const SAW_IT: i32 = 12;
/// How much less a lesson weighs when only heard of from afar.
const HEARD_OF_IT: f32 = 0.75;

/// Partner, parent, child, brother or sister.
pub(crate) fn close_kin(
    w: &crate::organism::organism::Organism,
    d: &crate::organism::organism::Organism,
) -> bool {
    let real = |id: &str| !id.is_empty() && id != "genesis";
    let siblings = (real(&w.parent_id) && w.parent_id == d.parent_id)
        || w.father_id
            .as_deref()
            .is_some_and(|f| real(f) && d.father_id.as_deref() == Some(f));
    w.partner_id.as_deref() == Some(d.id.as_str())
        || w.parent_id == d.id
        || w.father_id.as_deref() == Some(d.id.as_str())
        || d.parent_id == w.id
        || d.father_id.as_deref() == Some(w.id.as_str())
        || siblings
}

impl Simulation {
    /// `witness` mourns `dead`, who died at `at` in a way that teaches `lesson`.
    pub(crate) fn take_lesson(&mut self, witness: usize, dead: usize, lesson: Lesson, at: (i32, i32)) {
        let (w, d) = (&self.organisms[witness], &self.organisms[dead]);
        if w.age_stage() == AgeStage::Infant {
            return;
        }
        let saw_it = (w.x as i32 - at.0).abs() + (w.y as i32 - at.1).abs() <= SAW_IT;
        let kin = close_kin(w, d);
        let strength = match (saw_it, kin) {
            (true, true) => FROM_KIN,
            (true, false) => FROM_NEIGHBOUR,
            (false, true) => FROM_NEIGHBOUR * HEARD_OF_IT,
            (false, false) => return,
        };
        let (dead_id, dead_name) = (d.id.clone(), d.name.clone());
        if self.organisms[witness].lessons.learn(lesson, strength) {
            let tick = self.tick_count;
            self.organisms[witness].log_life_rel(
                tick,
                "lesson",
                lesson.story(&dead_name),
                Some(dead_id),
                Some(dead_name),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tribe() -> Simulation {
        let mut sim = Simulation::new(7);
        let lineage = sim.organisms[0].lineage_id.clone();
        for (i, o) in sim.organisms.iter_mut().enumerate().take(4) {
            o.alive = true;
            o.x = 50.0 + i as f32;
            o.y = 50.0;
            o.age = o.max_age / 3;
            o.lineage_id = lineage.clone();
            o.lessons = Default::default();
        }
        sim
    }

    #[test]
    fn a_child_who_saw_their_mother_drown_heeds_it_more_than_a_neighbour() {
        let mut sim = tribe();
        let mother = sim.organisms[0].id.clone();
        sim.organisms[1].parent_id = mother;
        sim.take_lesson(1, 0, Lesson::Water, (50, 50));
        sim.take_lesson(2, 0, Lesson::Water, (50, 50));
        let child = sim.organisms[1].lessons.heeds(Lesson::Water);
        let neighbour = sim.organisms[2].lessons.heeds(Lesson::Water);
        assert!(child > neighbour && neighbour > 0.0, "{child} vs {neighbour}");
        assert!(sim.organisms[1]
            .life_log
            .iter()
            .any(|e| e.category == "lesson" && e.text.starts_with("learned to fear deep water after")));
    }

    #[test]
    fn a_death_by_hunger_in_the_village_teaches_those_who_saw_it() {
        let mut sim = tribe();
        sim.organisms[0].energy = 0.0;
        sim.organisms[0].hydration = 0.9;
        sim.tick();
        assert!(!sim.organisms[0].alive);
        assert_eq!(sim.organisms[0].death_cause, "starvation");
        assert!(sim.organisms[1].lessons.heeds(Lesson::Hunger) > 0.0);
    }

    #[test]
    fn a_sibling_who_saw_it_takes_it_as_kin() {
        let mut sim = tribe();
        sim.organisms[0].parent_id = "mother".into();
        sim.organisms[1].parent_id = "mother".into();
        sim.organisms[2].parent_id = "genesis".into();
        sim.organisms[0].parent_id = "genesis".into();
        sim.take_lesson(2, 0, Lesson::Water, (50, 50));
        sim.organisms[0].parent_id = "mother".into();
        sim.take_lesson(1, 0, Lesson::Water, (50, 50));
        assert_eq!(sim.organisms[1].lessons.strength(Lesson::Water), FROM_KIN);
        assert_eq!(
            sim.organisms[2].lessons.strength(Lesson::Water),
            FROM_NEIGHBOUR,
            "the founders' shared marker is no family tie"
        );
    }

    #[test]
    fn a_stranger_from_another_tribe_who_saw_it_learns_too() {
        let mut sim = tribe();
        sim.organisms[2].lineage_id = "other".into();
        sim.organisms[2].friends.clear();
        sim.organisms[0].energy = 0.0;
        sim.organisms[0].hydration = 0.9;
        sim.tick();
        assert_eq!(sim.organisms[0].death_cause, "starvation");
        assert!(sim.organisms[2].lessons.heeds(Lesson::Hunger) > 0.0);
    }

    #[test]
    fn a_parent_far_away_hears_of_it() {
        let mut sim = tribe();
        let parent = sim.organisms[3].id.clone();
        sim.organisms[0].parent_id = parent;
        sim.organisms[3].x = 95.0;
        sim.organisms[0].energy = 0.0;
        sim.organisms[0].hydration = 0.9;
        sim.tick();
        assert_eq!(sim.organisms[0].death_cause, "starvation");
        assert!(sim.organisms[3].lessons.heeds(Lesson::Hunger) > 0.0);
    }

    #[test]
    fn a_stranger_far_away_learns_nothing() {
        let mut sim = tribe();
        sim.organisms[3].x = 90.0;
        sim.take_lesson(3, 0, Lesson::Hunger, (50, 50));
        assert_eq!(sim.organisms[3].lessons.strength(Lesson::Hunger), 0.0);
    }
}
