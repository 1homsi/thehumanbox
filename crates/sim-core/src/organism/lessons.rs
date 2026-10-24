//! What a death teaches the people who saw it. Someone who watched a friend
//! drown keeps out of deep water; someone who saw their mother starve tops up
//! on food long before they are hungry. A lesson is strongest in close kin and
//! fades over a lifetime, and children grow up with a little of their
//! parents' caution.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Lesson {
    /// Saw someone drown: leaves the water sooner and wades less.
    Water,
    /// Saw someone starve: eats and gathers before they are hungry.
    Hunger,
    /// Saw someone die of thirst: drinks before they are thirsty.
    Thirst,
    /// Saw someone killed by an animal: gives beasts a wide berth.
    Beasts,
    /// Saw someone burn: keeps further from fire.
    Fire,
}

impl Lesson {
    pub const ALL: [Lesson; 5] = [
        Lesson::Water,
        Lesson::Hunger,
        Lesson::Thirst,
        Lesson::Beasts,
        Lesson::Fire,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Lesson::Water => "water",
            Lesson::Hunger => "hunger",
            Lesson::Thirst => "thirst",
            Lesson::Beasts => "beasts",
            Lesson::Fire => "fire",
        }
    }

    pub fn from_name(name: &str) -> Option<Lesson> {
        Lesson::ALL.into_iter().find(|l| l.name() == name)
    }

    /// The lesson a death by `cause` teaches, if it teaches one.
    pub fn of_death(cause: &str) -> Option<Lesson> {
        match cause {
            "drowning" => Some(Lesson::Water),
            "starvation" => Some(Lesson::Hunger),
            "dehydration" => Some(Lesson::Thirst),
            "beasts" => Some(Lesson::Beasts),
            "fire" => Some(Lesson::Fire),
            _ => None,
        }
    }

    /// How the life story tells it: "learned to fear deep water after Ana drowned".
    pub fn story(self, dead: &str) -> String {
        match self {
            Lesson::Water => format!("learned to fear deep water after {dead} drowned"),
            Lesson::Hunger => format!("learned to eat before hunger came after {dead} starved"),
            Lesson::Thirst => format!("learned to keep water near after {dead} died of thirst"),
            Lesson::Beasts => format!("learned to keep clear of beasts after one killed {dead}"),
            Lesson::Fire => format!("learned to respect fire after {dead} burned"),
        }
    }

    /// What an elder tells of: "the drowning", "the hungry time".
    pub fn told_as(self) -> &'static str {
        match self {
            Lesson::Water => "the drowning",
            Lesson::Hunger => "the hungry time",
            Lesson::Thirst => "the dry time",
            Lesson::Beasts => "the beast that killed",
            Lesson::Fire => "the fire",
        }
    }

    fn slot(self) -> usize {
        self as usize
    }
}

/// How strongly a lesson taken from close kin is felt, 0 to 1.
pub const FROM_KIN: f32 = 1.0;
/// How strongly a lesson taken from someone else in the tribe is felt.
pub const FROM_NEIGHBOUR: f32 = 0.6;
/// Below this a lesson no longer changes what they do.
pub const HEEDED: f32 = 0.25;
/// How much of a lesson fades each day.
pub const DAILY_FADE: f32 = 0.012;
/// How much of a parent's lesson a newborn starts with.
pub const UPBRINGING: f32 = 0.4;
/// How much of an elder's lesson the children by the fire take from the telling.
pub const TOLD: f32 = 0.5;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Lessons([f32; Lesson::ALL.len()]);

impl Lessons {
    /// How strongly the lesson is still heeded: 0 when forgotten or never learned.
    pub fn heeds(&self, lesson: Lesson) -> f32 {
        let s = self.0[lesson.slot()];
        if s >= HEEDED {
            s
        } else {
            0.0
        }
    }

    pub fn strength(&self, lesson: Lesson) -> f32 {
        self.0[lesson.slot()]
    }

    /// Takes a lesson at `strength`. Returns true when it is newly heeded.
    pub fn learn(&mut self, lesson: Lesson, strength: f32) -> bool {
        let slot = &mut self.0[lesson.slot()];
        let before = *slot;
        *slot = slot.max(strength.clamp(0.0, 1.0));
        before < HEEDED && *slot >= HEEDED
    }

    /// One day passes: every lesson fades a little.
    pub fn fade(&mut self) {
        for s in self.0.iter_mut() {
            *s = (*s - DAILY_FADE).max(0.0);
        }
    }

    /// What a child starts with: a share of the more careful parent's lessons.
    pub fn inherited(a: &Lessons, b: Option<&Lessons>) -> Lessons {
        let mut out = Lessons::default();
        for l in Lesson::ALL {
            let parent = b.map_or(a.strength(l), |b| a.strength(l).max(b.strength(l)));
            out.0[l.slot()] = parent * UPBRINGING;
        }
        out
    }

    /// Every lesson still held, by name, to two decimals, for saves.
    pub fn to_map(&self) -> BTreeMap<String, f32> {
        Lesson::ALL
            .into_iter()
            .filter(|&l| self.strength(l) >= 0.01)
            .map(|l| (l.name().to_string(), (self.strength(l) * 100.0).round() / 100.0))
            .collect()
    }

    pub fn from_map(map: &BTreeMap<String, f32>) -> Lessons {
        let mut out = Lessons::default();
        for (name, &s) in map {
            if let Some(l) = Lesson::from_name(name) {
                out.0[l.slot()] = s.clamp(0.0, 1.0);
            }
        }
        out
    }

    /// The lessons that still change what they do, strongest first.
    pub fn heeded(&self) -> Vec<Lesson> {
        let mut held: Vec<Lesson> = Lesson::ALL.into_iter().filter(|&l| self.heeds(l) > 0.0).collect();
        held.sort_by(|a, b| self.strength(*b).total_cmp(&self.strength(*a)).then(a.cmp(b)));
        held
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lesson_from_kin_is_heeded_for_a_lifetime_then_fades() {
        let mut lessons = Lessons::default();
        assert!(lessons.learn(Lesson::Water, FROM_KIN));
        assert!(!lessons.learn(Lesson::Water, FROM_NEIGHBOUR), "already heeded");
        let mut days = 0;
        while lessons.heeds(Lesson::Water) > 0.0 {
            lessons.fade();
            days += 1;
        }
        assert!((55..=70).contains(&days), "heeded for {days} days");
    }

    #[test]
    fn deaths_teach_by_their_cause_and_old_age_teaches_nothing() {
        assert_eq!(Lesson::of_death("drowning"), Some(Lesson::Water));
        assert_eq!(Lesson::of_death("starvation"), Some(Lesson::Hunger));
        assert_eq!(Lesson::of_death("old age"), None);
        assert_eq!(Lesson::of_death("war"), None);
    }

    #[test]
    fn children_start_with_some_of_the_more_careful_parents_caution() {
        let mut mother = Lessons::default();
        mother.learn(Lesson::Hunger, 0.9);
        let mut father = Lessons::default();
        father.learn(Lesson::Hunger, 0.5);
        father.learn(Lesson::Fire, 0.8);
        let child = Lessons::inherited(&mother, Some(&father));
        assert!((child.strength(Lesson::Hunger) - 0.36).abs() < 1e-6);
        assert!((child.strength(Lesson::Fire) - 0.32).abs() < 1e-6);
        assert_eq!(child.strength(Lesson::Water), 0.0);
    }

    #[test]
    fn every_lesson_can_be_told() {
        for l in Lesson::ALL {
            assert!(l.told_as().starts_with("the "));
        }
    }

    #[test]
    fn lessons_survive_a_save() {
        let mut lessons = Lessons::default();
        lessons.learn(Lesson::Beasts, 0.6);
        let back = Lessons::from_map(&lessons.to_map());
        assert_eq!(back.strength(Lesson::Beasts), 0.6);
        assert_eq!(back.heeded(), vec![Lesson::Beasts]);
    }
}
