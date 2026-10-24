//! A tribe grows weary of war. Every one of its people killed in battle adds to
//! the weariness, and a weary tribe often calls off a raid it was about to
//! make. When two weary tribes have fought, they make peace. The weariness
//! fades a little each day, so a generation that has not buried its warriors
//! is ready to fight again.
//!
//! Kept per tribe and saved with the world.

use crate::sim::civ::warfare::{establish_treaty, has_active_treaty, Battle, TreatyKind};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::RngExt;
use serde::{Deserialize, Serialize};

/// How much one of its people killed in battle adds to a tribe's weariness.
const PER_FALLEN: f32 = 0.08;
/// How much weariness fades each day.
const DAILY_FADE: f32 = 0.01;
/// A tribe this weary says so, and it shows on the tribe card.
pub const WEARY: f32 = 0.5;
/// Two tribes at least this weary make peace once they have fought.
const PEACE_AT: f32 = 0.35;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct WarWeariness {
    /// How tired of fighting the tribe is, 0 to 1.
    pub weariness: f32,
    /// Its people killed in battle since it last knew peace.
    pub fallen: u32,
}

impl Simulation {
    /// Someone of `lineage` was killed in battle.
    pub(crate) fn mourn_war_dead(&mut self, lineage: &str) {
        if lineage.is_empty() {
            return;
        }
        let entry = self.lineage_war_weariness.entry(lineage.to_string()).or_default();
        let before = entry.weariness;
        entry.weariness = (entry.weariness + PER_FALLEN).min(1.0);
        entry.fallen += 1;
        let fallen = entry.fallen;
        if before < WEARY && entry.weariness >= WEARY {
            let name = self.tribe_name(lineage);
            push_event(
                &mut self.events,
                self.tick_count,
                "life",
                &name,
                &format!("have buried {fallen} of their own in battle and are weary of war"),
            );
        }
    }

    /// How weary of war `lineage` is (0 when not at all).
    pub(crate) fn war_weariness(&self, lineage: &str) -> f32 {
        self.lineage_war_weariness
            .get(lineage)
            .map_or(0.0, |w| w.weariness)
    }

    /// A weary tribe often calls off the attack it was about to make: the
    /// wearier it is, the likelier.
    pub(crate) fn weary_stay_home(&mut self, battles: Vec<Battle>) -> Vec<Battle> {
        if self.lineage_war_weariness.is_empty() {
            return battles;
        }
        let mut kept = Vec::with_capacity(battles.len());
        for b in battles {
            let attacker = b.attackers.first().cloned().unwrap_or_default();
            let weariness = self.war_weariness(&attacker);
            if weariness <= 0.0 || self.rng.random::<f32>() >= weariness {
                kept.push(b);
                continue;
            }
            let (us, them) = (
                self.tribe_name(&attacker),
                self.tribe_name(b.defenders.first().map_or("", String::as_str)),
            );
            push_event(
                &mut self.events,
                self.tick_count,
                "life",
                &us,
                &format!("are too weary of war to march on the {them}"),
            );
        }
        kept
    }

    /// After the day's fighting: two weary tribes that have just fought each
    /// other make peace.
    pub(crate) fn make_weary_peace(&mut self) {
        let tick = self.tick_count;
        let ended: Vec<(String, String)> = self
            .battles
            .iter()
            .filter(|b| b.ended_tick == Some(tick))
            .filter_map(|b| Some((b.attackers.first()?.clone(), b.defenders.first()?.clone())))
            .collect();
        for (a, b) in ended {
            if self.war_weariness(&a) < PEACE_AT
                || self.war_weariness(&b) < PEACE_AT
                || has_active_treaty(&self.treaties, &a, &b, tick)
            {
                continue;
            }
            let expires = tick + 3000 + self.rng.random::<u64>() % 3000;
            if !establish_treaty(
                &mut self.treaties,
                &mut self.organisms,
                &a,
                &b,
                TreatyKind::NonAggression,
                tick,
                expires,
            ) {
                continue;
            }
            let (an, bn) = (self.tribe_name(&a), self.tribe_name(&b));
            push_event(
                &mut self.events,
                tick,
                "treaty_signed",
                &a,
                &format!("worn out by war, the {an} and the {bn} make peace"),
            );
        }
    }

    /// Once a day the weariness fades; a tribe that has put it behind it
    /// forgets its count of the fallen.
    pub(crate) fn tick_war_weariness(&mut self) {
        if self.tick_count % DAY_LENGTH != DAY_LENGTH / 3 {
            return;
        }
        self.lineage_war_weariness.retain(|_, w| {
            w.weariness -= DAILY_FADE;
            w.weariness > 0.0
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::warfare::{BattleOutcome, BattleScale};

    fn raid(attacker: &str, defender: &str) -> Battle {
        Battle {
            id: format!("battle_{attacker}_{defender}"),
            attackers: vec![attacker.into()],
            defenders: vec![defender.into()],
            attacker_orgs: vec![],
            defender_orgs: vec![],
            scale: BattleScale::Raid,
            location: (10, 10),
            started_tick: 0,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 3,
            initial_d: 3,
        }
    }

    #[test]
    fn the_fallen_make_a_tribe_weary_and_it_fades_by_the_day() {
        let mut sim = Simulation::new(3);
        for _ in 0..7 {
            sim.mourn_war_dead("clan");
        }
        assert!(sim.war_weariness("clan") >= WEARY);
        assert_eq!(sim.lineage_war_weariness["clan"].fallen, 7);
        assert!(sim.events.iter().any(|e| e.detail.contains("weary of war")));

        let mut days = 0;
        while sim.war_weariness("clan") > 0.0 {
            days += 1;
            sim.tick_count = DAY_LENGTH * days + DAY_LENGTH / 3;
            sim.tick_war_weariness();
        }
        assert!((50..=60).contains(&days), "weary for {days} days");
        assert!(!sim.lineage_war_weariness.contains_key("clan"));
    }

    #[test]
    fn a_weary_tribe_calls_off_most_raids_and_a_fresh_one_none() {
        let mut sim = Simulation::new(3);
        let fresh = sim.weary_stay_home((0..40).map(|_| raid("bold", "them")).collect());
        assert_eq!(fresh.len(), 40);

        for _ in 0..10 {
            sim.mourn_war_dead("tired");
        }
        let kept = sim.weary_stay_home((0..40).map(|_| raid("tired", "them")).collect());
        assert!(kept.len() < 20, "{} of 40 raids still went ahead", kept.len());
        assert!(sim.events.iter().any(|e| e.detail.contains("too weary of war")));
    }

    #[test]
    fn two_weary_tribes_make_peace_after_a_fight_but_not_a_weary_and_a_fresh_one() {
        let mut sim = Simulation::new(3);
        sim.tick_count = 500;
        for _ in 0..5 {
            sim.mourn_war_dead("north");
            sim.mourn_war_dead("south");
        }
        let mut fought = raid("north", "south");
        fought.ended_tick = Some(500);
        fought.outcome = Some(BattleOutcome::Stalemate);
        let mut other = raid("north", "east");
        other.ended_tick = Some(500);
        sim.battles = vec![fought, other];

        sim.make_weary_peace();
        assert!(has_active_treaty(&sim.treaties, "north", "south", 500));
        assert!(!has_active_treaty(&sim.treaties, "north", "east", 500));
    }
}
