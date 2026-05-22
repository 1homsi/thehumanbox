use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub mod pre_stone;
pub mod stone;
pub mod bronze;
pub mod iron;
pub mod classical;
pub mod medieval;
pub mod renaissance;
pub mod industrial;
pub mod modern;
pub mod information;
pub mod atomic;
pub mod space;
pub mod digital;
pub mod quantum;
pub mod solar;
pub mod fusion;
pub mod genetic;
pub mod orbital;
pub mod lunar;
pub mod martian;
pub mod cyber;
pub mod neural;
pub mod posthuman;
pub mod interstellar;
pub mod singularity;
pub mod galactic;
pub mod dyson;
pub mod kardashev2;
pub mod kardashev3;
pub mod stellar;
pub mod nebular;
pub mod universal;
pub mod multiverse;
pub mod transcendent;
pub mod eldritch;

pub struct EraSpec {
    pub name: &'static str,
    pub discoveries: &'static [&'static str],
    pub pop_threshold: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Era {
    PreStone,
    Stone,
    Bronze,
    Iron,
    Classical,
    Medieval,
    Renaissance,
    Industrial,
    Modern,
    Information,
    Atomic,
    Space,
    Digital,
    Quantum,
    Solar,
    Fusion,
    Genetic,
    Orbital,
    Lunar,
    Martian,
    Cyber,
    Neural,
    Posthuman,
    Interstellar,
    Singularity,
    Galactic,
    Dyson,
    Kardashev2,
    Kardashev3,
    Stellar,
    Nebular,
    Universal,
    Multiverse,
    Transcendent,
    Eldritch,
}

pub const LADDER: [Era; 35] = [
    Era::PreStone, Era::Stone, Era::Bronze, Era::Iron, Era::Classical,
    Era::Medieval, Era::Renaissance, Era::Industrial, Era::Modern, Era::Information,
    Era::Atomic, Era::Space, Era::Digital, Era::Quantum, Era::Solar,
    Era::Fusion, Era::Genetic, Era::Orbital, Era::Lunar, Era::Martian,
    Era::Cyber, Era::Neural, Era::Posthuman, Era::Interstellar, Era::Singularity,
    Era::Galactic, Era::Dyson, Era::Kardashev2, Era::Kardashev3, Era::Stellar,
    Era::Nebular, Era::Universal, Era::Multiverse, Era::Transcendent, Era::Eldritch,
];

impl Era {
    pub fn spec(self) -> &'static EraSpec {
        match self {
            Era::PreStone => &pre_stone::SPEC,
            Era::Stone => &stone::SPEC,
            Era::Bronze => &bronze::SPEC,
            Era::Iron => &iron::SPEC,
            Era::Classical => &classical::SPEC,
            Era::Medieval => &medieval::SPEC,
            Era::Renaissance => &renaissance::SPEC,
            Era::Industrial => &industrial::SPEC,
            Era::Modern => &modern::SPEC,
            Era::Information => &information::SPEC,
            Era::Atomic => &atomic::SPEC,
            Era::Space => &space::SPEC,
            Era::Digital => &digital::SPEC,
            Era::Quantum => &quantum::SPEC,
            Era::Solar => &solar::SPEC,
            Era::Fusion => &fusion::SPEC,
            Era::Genetic => &genetic::SPEC,
            Era::Orbital => &orbital::SPEC,
            Era::Lunar => &lunar::SPEC,
            Era::Martian => &martian::SPEC,
            Era::Cyber => &cyber::SPEC,
            Era::Neural => &neural::SPEC,
            Era::Posthuman => &posthuman::SPEC,
            Era::Interstellar => &interstellar::SPEC,
            Era::Singularity => &singularity::SPEC,
            Era::Galactic => &galactic::SPEC,
            Era::Dyson => &dyson::SPEC,
            Era::Kardashev2 => &kardashev2::SPEC,
            Era::Kardashev3 => &kardashev3::SPEC,
            Era::Stellar => &stellar::SPEC,
            Era::Nebular => &nebular::SPEC,
            Era::Universal => &universal::SPEC,
            Era::Multiverse => &multiverse::SPEC,
            Era::Transcendent => &transcendent::SPEC,
            Era::Eldritch => &eldritch::SPEC,
        }
    }

    pub fn name(self) -> &'static str { self.spec().name }
    pub fn required_discoveries(self) -> &'static [&'static str] { self.spec().discoveries }
    fn pop_threshold(self) -> usize { self.spec().pop_threshold }

    pub fn advance(&self) -> Option<Era> {
        let i = LADDER.iter().position(|e| e == self)?;
        LADDER.get(i + 1).copied()
    }

    pub fn from_name(s: &str) -> Option<Era> {
        LADDER.iter().copied().find(|e| e.name() == s)
    }
}

pub fn determine_era_for_lineage(discoveries: &HashSet<String>, pop: usize) -> Era {
    let mut best = Era::PreStone;
    for era in LADDER.iter().copied() {
        let has_all = era.required_discoveries().iter().all(|d| discoveries.contains(*d));
        if has_all && pop >= era.pop_threshold() {
            best = era;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pre_stone_with_no_discoveries() {
        let d: HashSet<String> = HashSet::new();
        assert_eq!(determine_era_for_lineage(&d, 0), Era::PreStone);
        assert_eq!(determine_era_for_lineage(&d, 100), Era::PreStone);
    }

    #[test]
    fn stone_with_stone_discoveries() {
        let mut d: HashSet<String> = HashSet::new();
        d.insert("fire".to_string());
        d.insert("stone_tools".to_string());
        d.insert("shelter".to_string());
        assert_eq!(determine_era_for_lineage(&d, 1), Era::Stone);
    }

    #[test]
    fn ladder_is_well_ordered() {
        for w in LADDER.windows(2) {
            assert!(w[0] < w[1], "{:?} should be < {:?}", w[0], w[1]);
        }
    }

    #[test]
    fn every_era_has_unique_name() {
        let mut seen: HashSet<&str> = HashSet::new();
        for e in LADDER.iter() {
            assert!(seen.insert(e.name()), "duplicate era name: {}", e.name());
        }
    }
}
