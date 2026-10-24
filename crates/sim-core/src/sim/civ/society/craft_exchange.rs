//! Crafts travel with trade. When a caravan arrives from a tribe known for a
//! craft, the buyer and a few of their people around them pick up something of
//! it from the trader: how the river tribe sets its nets, how the hill tribe
//! splits stone. Half what watching their own kin would teach, and never past
//! what the trader's tribe knows. So the skills of one people spread along the
//! roads they trade on.

use crate::organism::skills::{self, Skill};
use crate::sim::civ::society::tribe_crafts::KNOWN_FOR;
use crate::sim::simulation::Simulation;

/// How many of the buyer's people, besides the buyer, gather round the trader.
const ONLOOKERS: usize = 3;
/// How close they must be to the buyer to see the trader's ways.
const ONLOOKER_REACH: i32 = 6;

impl Simulation {
    /// A caravan from `sender_lineage` was received by `buyer`; `trader` is the
    /// sender's person who made the trade, if they are still about.
    pub(crate) fn share_craft_by_trade(&mut self, sender_lineage: &str, buyer: usize, trader: Option<usize>) {
        let Some(skill) = self.tribe_craft(sender_lineage) else {
            return;
        };
        // The trader shows what they know, or what their tribe is known for.
        let shown = trader
            .map(|t| self.organisms[t].skills.level(skill))
            .unwrap_or(0.0)
            .max(KNOWN_FOR);
        let tribe_name = self.tribe_name(sender_lineage);
        let buyer_lineage = self.organisms[buyer].lineage_id.clone();
        if buyer_lineage == sender_lineage {
            return;
        }
        let at = (self.organisms[buyer].x as i32, self.organisms[buyer].y as i32);
        let mut learners = vec![buyer];
        learners.extend(
            self.organisms
                .iter()
                .enumerate()
                .filter(|&(i, o)| {
                    i != buyer
                        && o.alive
                        && o.lineage_id == buyer_lineage
                        && (o.x as i32 - at.0).abs() + (o.y as i32 - at.1).abs() <= ONLOOKER_REACH
                })
                .map(|(i, _)| i)
                .take(ONLOOKERS),
        );
        let tick = self.tick_count;
        for i in learners {
            let (before, after) = {
                let o = &mut self.organisms[i];
                let aptitude = skills::aptitude(o.age_stage(), o.traits.memory_strength, o.traits.curiosity);
                let before = o.skills.level(skill);
                o.skills.set(
                    skill,
                    before + skills::watching_gain(before, shown, aptitude) * 0.5,
                );
                (before, o.skills.level(skill))
            };
            if before < 0.01 && after >= 0.01 {
                self.organisms[i].log_life(tick, "learned", way_of(&tribe_name, skill));
            }
        }
    }
}

/// "learned the Ash way of fishing from a trader"
fn way_of(tribe: &str, skill: Skill) -> String {
    format!("learned the {tribe} way of {} from a trader", skill.name())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two_tribes() -> Simulation {
        let mut sim = Simulation::new(17);
        sim.organisms.truncate(6);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            o.age = o.max_age / 3;
            o.skills = Default::default();
            o.lineage_id = if i < 3 { "river".into() } else { "hill".into() };
            o.x = if i < 3 { 20.0 } else { 50.0 + i as f32 };
            o.y = 50.0;
        }
        sim.lineage_names.insert("river".into(), "Ash".into());
        sim
    }

    #[test]
    fn a_buyer_and_those_around_learn_the_traders_craft() {
        let mut sim = two_tribes();
        sim.lineage_crafts.insert("river".into(), Skill::Fishing);
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        for _ in 0..30 {
            sim.share_craft_by_trade("river", 3, Some(0));
        }
        for i in 3..6 {
            let level = sim.organisms[i].skills.level(Skill::Fishing);
            assert!(level > 0.05 && level < 0.8, "person {i}: {level}");
        }
        assert!(sim.organisms[3]
            .life_log
            .iter()
            .any(|e| e.text == "learned the Ash way of fishing from a trader"));
        assert_eq!(
            sim.organisms[1].skills.level(Skill::Fishing),
            0.0,
            "the trader's own tribe at home learns nothing"
        );
    }

    #[test]
    fn a_tribe_known_for_nothing_passes_nothing_on() {
        let mut sim = two_tribes();
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        sim.share_craft_by_trade("river", 3, Some(0));
        assert_eq!(sim.organisms[3].skills.level(Skill::Fishing), 0.0);
    }
}
