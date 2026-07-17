use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub mod atomic;
pub mod bronze;
pub mod classical;
pub mod cyber;
pub mod digital;
pub mod dyson;
pub mod eldritch;
pub mod fusion;
pub mod galactic;
pub mod genetic;
pub mod industrial;
pub mod information;
pub mod interstellar;
pub mod iron;
pub mod kardashev2;
pub mod kardashev3;
pub mod lunar;
pub mod martian;
pub mod medieval;
pub mod modern;
pub mod multiverse;
pub mod nebular;
pub mod neural;
pub mod orbital;
pub mod posthuman;
pub mod pre_stone;
pub mod quantum;
pub mod renaissance;
pub mod singularity;
pub mod solar;
pub mod space;
pub mod stellar;
pub mod stone;
pub mod transcendent;
pub mod universal;

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
    Era::PreStone,
    Era::Stone,
    Era::Bronze,
    Era::Iron,
    Era::Classical,
    Era::Medieval,
    Era::Renaissance,
    Era::Industrial,
    Era::Modern,
    Era::Information,
    Era::Atomic,
    Era::Space,
    Era::Digital,
    Era::Quantum,
    Era::Solar,
    Era::Fusion,
    Era::Genetic,
    Era::Orbital,
    Era::Lunar,
    Era::Martian,
    Era::Cyber,
    Era::Neural,
    Era::Posthuman,
    Era::Interstellar,
    Era::Singularity,
    Era::Galactic,
    Era::Dyson,
    Era::Kardashev2,
    Era::Kardashev3,
    Era::Stellar,
    Era::Nebular,
    Era::Universal,
    Era::Multiverse,
    Era::Transcendent,
    Era::Eldritch,
];

/// The original technology ladder was balanced around the hosted world's
/// 350-person ceiling. Keep every established gate through Posthuman intact,
/// then spread the formerly unreachable late-game gates across the remaining
/// capacity selected for this world.
const BASELINE_WORLD_CAPACITY: usize = 350;
const FINAL_ERA_RAW_THRESHOLD: usize = 1260;

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

    pub fn name(self) -> &'static str {
        self.spec().name
    }
    pub fn required_discoveries(self) -> &'static [&'static str] {
        self.spec().discoveries
    }
    pub fn pop_threshold(self) -> usize {
        self.spec().pop_threshold
    }

    pub fn population_gate(self, population_limit: usize) -> usize {
        // A later era must never demand fewer people than an earlier one.
        // (Modern historically listed 30 after Industrial's 40.)
        let raw = LADDER
            .iter()
            .copied()
            .take_while(|era| *era <= self)
            .map(Era::pop_threshold)
            .max()
            .unwrap_or(0);
        if raw <= BASELINE_WORLD_CAPACITY {
            return raw.min(population_limit);
        }
        if population_limit <= BASELINE_WORLD_CAPACITY {
            return population_limit;
        }

        let raw_span = FINAL_ERA_RAW_THRESHOLD - BASELINE_WORLD_CAPACITY;
        let world_span = population_limit - BASELINE_WORLD_CAPACITY;
        let late_progress = raw - BASELINE_WORLD_CAPACITY;
        BASELINE_WORLD_CAPACITY + late_progress.saturating_mul(world_span).div_ceil(raw_span)
    }

    pub fn advance(&self) -> Option<Era> {
        let i = LADDER.iter().position(|e| e == self)?;
        LADDER.get(i + 1).copied()
    }

    pub fn from_name(s: &str) -> Option<Era> {
        LADDER.iter().copied().find(|e| e.name() == s)
    }
}

/// Finds the highest era supported by one lineage's discoveries and the
/// living world's civilization capacity. Knowledge remains lineage-specific,
/// while population gates represent the people available across the world to
/// sustain increasingly complex technology.
pub fn determine_era_for_lineage(
    discoveries: &HashSet<String>,
    world_population: usize,
    population_limit: usize,
) -> Era {
    let mut best = Era::PreStone;
    for era in LADDER.iter().copied() {
        let has_all = era
            .required_discoveries()
            .iter()
            .all(|d| discoveries.contains(*d));
        if has_all && world_population >= era.population_gate(population_limit) {
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
        assert_eq!(determine_era_for_lineage(&d, 0, 350), Era::PreStone);
        assert_eq!(determine_era_for_lineage(&d, 100, 350), Era::PreStone);
    }

    #[test]
    fn stone_with_stone_discoveries() {
        let mut d: HashSet<String> = HashSet::new();
        d.insert("fire".to_string());
        d.insert("stone_tools".to_string());
        d.insert("shelter".to_string());
        assert_eq!(determine_era_for_lineage(&d, 1, 350), Era::Stone);
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

    #[test]
    fn every_world_size_can_reach_the_full_ladder_without_weakening_early_eras() {
        for population_limit in [120, 350, 500, 1000, 2000, 5000] {
            let gates: Vec<usize> = LADDER
                .iter()
                .map(|era| era.population_gate(population_limit))
                .collect();
            assert!(gates.windows(2).all(|window| window[0] <= window[1]));
            assert_eq!(Era::Eldritch.population_gate(population_limit), population_limit);
        }

        assert_eq!(Era::Atomic.population_gate(500), Era::Atomic.pop_threshold());
        assert_eq!(
            Era::Posthuman.population_gate(500),
            Era::Posthuman.pop_threshold()
        );
        assert_eq!(Era::Interstellar.population_gate(500), 354);
        assert_eq!(Era::Modern.population_gate(500), Era::Industrial.pop_threshold());
    }
}
