//! What a tribe is known for. Once its grown members are, on average, handy at
//! one kind of work (fishing on the coast, woodcutting at the forest's edge),
//! the tribe becomes known for it. Its children grow up around that work and
//! start with a feel for it, and its people lean toward it when they choose
//! the day's work, so the craft passes down the generations. A tribe whose
//! people drift to other work loses the name in time.
//!
//! Worked out once a day from the people themselves, so nothing extra is saved.

use crate::organism::skills::Skill;
use crate::sim::age_stage::AgeStage;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// A tribe is known for a craft when its grown members average this much of it.
pub const KNOWN_FOR: f32 = 0.3;
/// Grown members a tribe needs before it is known for anything.
const MIN_GROWN: usize = 3;
/// A child growing up in such a tribe picks the craft up to this level by
/// being around it, a little each day.
pub const UPBRINGING: f32 = 0.15;
const UPBRINGING_PER_DAY: f32 = 0.01;

impl Simulation {
    /// The craft `lineage` is known for, if any.
    pub fn tribe_craft(&self, lineage: &str) -> Option<Skill> {
        self.lineage_crafts.get(lineage).copied()
    }

    /// Once a day: which craft each tribe is known for, and what its children pick up.
    pub(crate) fn tick_tribe_crafts(&mut self) {
        if self.tick_count % DAY_LENGTH != DAY_LENGTH / 3 {
            return;
        }
        let mut totals: std::collections::BTreeMap<&str, ([f32; Skill::ALL.len()], usize)> =
            Default::default();
        for o in self
            .organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
        {
            if !matches!(o.age_stage(), AgeStage::Teen | AgeStage::Adult | AgeStage::Elder) {
                continue;
            }
            let entry = totals.entry(o.lineage_id.as_str()).or_default();
            for (i, skill) in Skill::ALL.into_iter().enumerate() {
                entry.0[i] += o.skills.level(skill);
            }
            entry.1 += 1;
        }
        let mut crafts: Vec<(String, Option<Skill>)> = Vec::new();
        for (lineage, (sums, grown)) in totals {
            let best = (grown >= MIN_GROWN)
                .then(|| {
                    Skill::ALL
                        .into_iter()
                        .zip(sums)
                        .map(|(s, sum)| (s, sum / grown as f32))
                        .filter(|&(_, mean)| mean >= KNOWN_FOR)
                        .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(&a.0)))
                        .map(|(s, _)| s)
                })
                .flatten();
            crafts.push((lineage.to_string(), best));
        }
        let tick = self.tick_count;
        // The map is rebuilt from today's people, so a tribe with no grown
        // members left loses its craft too. The first pass after a world is
        // made or loaded fills it in quietly: those crafts are not news.
        let announce = self.lineage_crafts_ready;
        let before_all = std::mem::take(&mut self.lineage_crafts);
        for (lineage, craft) in crafts {
            let before = before_all.get(&lineage).copied();
            if let Some(skill) = craft {
                self.lineage_crafts.insert(lineage.clone(), skill);
                if announce && before != Some(skill) {
                    let name = self
                        .lineage_names
                        .get(&lineage)
                        .cloned()
                        .unwrap_or_else(|| "a tribe".to_string());
                    push_event(
                        &mut self.events,
                        tick,
                        "life",
                        &name,
                        &format!("became known for their {}", skill.name()),
                    );
                }
            }
        }
        self.lineage_crafts_ready = true;
        // Dread of a kind of work eases a little each day, and children pick up
        // the craft of the tribe they grow up in.
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            o.skills.ease_dread();
            if !matches!(o.age_stage(), AgeStage::Child | AgeStage::Teen) {
                continue;
            }
            let Some(&skill) = self.lineage_crafts.get(&o.lineage_id) else {
                continue;
            };
            let level = o.skills.level(skill);
            if level < UPBRINGING {
                o.skills.set(skill, (level + UPBRINGING_PER_DAY).min(UPBRINGING));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tribe(adult_fishing: f32) -> Simulation {
        let mut sim = Simulation::new(4);
        sim.organisms.truncate(6);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            o.lineage_id = "clan".into();
            o.skills = Default::default();
            o.max_age = 6000;
            o.age = if i < 4 { 3000 } else { 600 };
            if i < 4 {
                o.skills.set(Skill::Fishing, adult_fishing);
            }
        }
        sim
    }

    fn next_day(sim: &mut Simulation) {
        sim.tick_count = (sim.tick_count / DAY_LENGTH + 1) * DAY_LENGTH + DAY_LENGTH / 3;
        sim.tick_tribe_crafts();
    }

    #[test]
    fn a_tribe_of_fishers_is_known_for_fishing_and_its_children_pick_it_up() {
        let mut sim = tribe(0.5);
        sim.lineage_crafts_ready = true;
        assert_eq!(sim.organisms[4].age_stage(), AgeStage::Child);
        next_day(&mut sim);
        assert_eq!(sim.tribe_craft("clan"), Some(Skill::Fishing));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "became known for their fishing"));
        for _ in 0..30 {
            next_day(&mut sim);
        }
        let child = sim.organisms[4].skills.level(Skill::Fishing);
        assert!((child - UPBRINGING).abs() < 1e-6, "child fishing {child}");
    }

    #[test]
    fn a_tribe_that_is_not_good_at_anything_is_known_for_nothing() {
        let mut sim = tribe(0.1);
        next_day(&mut sim);
        assert_eq!(sim.tribe_craft("clan"), None);
        assert_eq!(sim.organisms[4].skills.level(Skill::Fishing), 0.0);
    }

    #[test]
    fn a_tribe_with_no_grown_members_left_loses_its_craft() {
        let mut sim = tribe(0.5);
        next_day(&mut sim);
        for o in sim.organisms.iter_mut().take(4) {
            o.alive = false;
        }
        next_day(&mut sim);
        assert_eq!(sim.tribe_craft("clan"), None);
    }

    #[test]
    fn crafts_found_on_the_first_pass_after_loading_are_not_announced() {
        let mut sim = tribe(0.5);
        sim.lineage_crafts_ready = false;
        next_day(&mut sim);
        assert_eq!(sim.tribe_craft("clan"), Some(Skill::Fishing));
        assert!(!sim
            .events
            .iter()
            .any(|e| e.detail.starts_with("became known for")));
    }

    #[test]
    fn a_tribe_loses_the_name_when_its_people_lose_the_craft() {
        let mut sim = tribe(0.5);
        next_day(&mut sim);
        for o in sim.organisms.iter_mut() {
            o.skills.set(Skill::Fishing, 0.05);
        }
        next_day(&mut sim);
        assert_eq!(sim.tribe_craft("clan"), None);
    }
}
