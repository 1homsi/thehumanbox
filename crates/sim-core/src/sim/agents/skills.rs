//! Practising a skill: the practice itself, the milestones people remember,
//! and what kin and friends nearby pick up by watching. The learning curves
//! live in `organism::skills`.

use crate::organism::skills::{self, Milestone, Skill};
use crate::sim::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::RngExt;

/// People this close (tiles, Manhattan) see the work done.
const WATCH_REACH: f32 = 5.0;
/// At most this many people learn from one piece of work.
const MAX_WATCHERS: usize = 3;
/// A child watching their own parent learns this much faster.
const PARENT_BONUS: f32 = 2.0;

impl Simulation {
    /// Record an attempt at `skill` by `idx`: the worker practises, and on a
    /// success kin and friends among `nearby` learn a little by watching.
    /// Returns the extra units a practised hand gets from a success (0 or 1).
    pub fn practise_skill(&mut self, idx: usize, skill: Skill, succeeded: bool, nearby: &[usize]) -> u8 {
        let (before, after) = {
            let o = &mut self.organisms[idx];
            let aptitude = skills::aptitude(o.age_stage(), o.traits.memory_strength, o.traits.curiosity);
            let before = o.skills.level(skill);
            o.skills
                .set(skill, before + skills::practice_gain(before, succeeded, aptitude));
            (before, o.skills.level(skill))
        };
        if let Some(milestone) = skills::milestone_crossed(before, after) {
            self.skill_milestone(idx, skill, milestone);
        }
        if !succeeded {
            return 0;
        }
        {
            // Work that keeps going well grows on a person.
            let o = &mut self.organisms[idx];
            let liked = o.skills.feeling(skill) + crate::organism::skills::LIKING_PER_SUCCESS;
            if o.skills.feeling(skill) >= 0.0 {
                o.skills.set_feeling(skill, liked);
            }
        }
        self.teach_by_example(idx, skill, after, nearby);
        let chance = skills::extra_yield_chance(after);
        u8::from(chance > 0.0 && self.rng.random::<f32>() < chance)
    }

    /// Kin and friends close enough to see the work learn from it.
    fn teach_by_example(&mut self, idx: usize, skill: Skill, level: f32, nearby: &[usize]) {
        let (wx, wy) = (self.organisms[idx].x, self.organisms[idx].y);
        let worker_id = self.organisms[idx].id.clone();
        let worker_lineage = self.organisms[idx].lineage_id.clone();
        let watchers: Vec<usize> = nearby
            .iter()
            .copied()
            .filter(|&i| i != idx)
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive
                    && (o.x - wx).abs() + (o.y - wy).abs() <= WATCH_REACH
                    && o.age_stage() != AgeStage::Infant
                    && o.skills.level(skill) + 0.05 < level
                    && (o.lineage_id == worker_lineage || o.friends.contains_key(&worker_id))
            })
            .take(MAX_WATCHERS)
            .collect();
        for w in watchers {
            let (before, after) = {
                let o = &mut self.organisms[w];
                let mut aptitude =
                    skills::aptitude(o.age_stage(), o.traits.memory_strength, o.traits.curiosity);
                if o.parent_id == worker_id || o.father_id.as_deref() == Some(worker_id.as_str()) {
                    aptitude *= PARENT_BONUS;
                }
                let before = o.skills.level(skill);
                o.skills
                    .set(skill, before + skills::watching_gain(before, level, aptitude));
                (before, o.skills.level(skill))
            };
            self.lessons_watched += 1;
            if before < 0.01 && after >= 0.01 {
                let tick = self.tick_count;
                let teacher = self.organisms[idx].name.clone();
                self.organisms[w].log_life_rel(
                    tick,
                    "learned",
                    format!("began to learn {} by watching {}", skill.name(), teacher),
                    Some(worker_id.clone()),
                    Some(teacher),
                );
            }
            if let Some(milestone) = skills::milestone_crossed(before, after) {
                self.skill_milestone(w, skill, milestone);
            }
        }
    }

    fn skill_milestone(&mut self, idx: usize, skill: Skill, milestone: Milestone) {
        let tick = self.tick_count;
        let o = &mut self.organisms[idx];
        let text = match milestone {
            Milestone::Handy => format!("got the hang of {}", skill.name()),
            Milestone::Skilled => format!("became a skilled {}", skill.worker()),
            Milestone::Master => format!("became a master {}", skill.worker()),
        };
        o.log_life(tick, "skill", text.clone());
        if milestone == Milestone::Master {
            o.attributes.insert(format!("master {}", skill.worker()));
            o.joy_ticks = (o.joy_ticks + 120).min(1200);
            let name = o.name.clone();
            push_event(&mut self.events, tick, "life", &name, &text);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn village() -> Simulation {
        let mut sim = Simulation::new(5);
        let lineage = sim.organisms[0].lineage_id.clone();
        for (i, o) in sim.organisms.iter_mut().enumerate().take(4) {
            o.alive = true;
            o.x = 50.0 + i as f32;
            o.y = 50.0;
            o.age = o.max_age / 3;
            o.lineage_id = lineage.clone();
            o.skills = Default::default();
        }
        sim
    }

    #[test]
    fn working_makes_the_worker_better() {
        let mut sim = village();
        for _ in 0..200 {
            sim.practise_skill(0, Skill::Fishing, true, &[]);
        }
        let level = sim.organisms[0].skills.level(Skill::Fishing);
        assert!(level > skills::SKILLED, "{level}");
        assert!(
            sim.organisms[0]
                .life_log
                .iter()
                .any(|e| e.text == "became a skilled fisher"),
            "the milestone was not remembered"
        );
    }

    #[test]
    fn kin_who_watch_learn_and_strangers_far_away_do_not() {
        let mut sim = village();
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        sim.organisms[3].x = 80.0;
        for _ in 0..20 {
            sim.practise_skill(0, Skill::Fishing, true, &[1, 2, 3]);
        }
        assert!(sim.organisms[1].skills.level(Skill::Fishing) > 0.05);
        assert_eq!(
            sim.organisms[3].skills.level(Skill::Fishing),
            0.0,
            "learned from afar"
        );
        let first = sim.organisms[1].life_log.iter().find(|e| e.category == "learned");
        assert!(first.is_some_and(|e| e.related_id.as_deref() == Some(sim.organisms[0].id.as_str())));
    }

    #[test]
    fn a_failure_teaches_the_worker_but_shows_nobody_anything() {
        let mut sim = village();
        sim.organisms[0].skills.set(Skill::Hunting, 0.8);
        assert_eq!(sim.practise_skill(0, Skill::Hunting, false, &[1]), 0);
        assert_eq!(sim.organisms[1].skills.level(Skill::Hunting), 0.0);
        assert!(sim.organisms[0].skills.level(Skill::Hunting) > 0.8);
    }

    #[test]
    fn masters_are_named_and_announced() {
        let mut sim = village();
        sim.organisms[0].skills.set(Skill::Building, 0.899);
        for _ in 0..50 {
            sim.practise_skill(0, Skill::Building, true, &[]);
        }
        assert!(sim.organisms[0].attributes.contains("master builder"));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("became a master builder")));
    }
}
