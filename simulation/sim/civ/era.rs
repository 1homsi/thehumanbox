use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
}

impl Era {
    pub fn name(self) -> &'static str {
        match self {
            Era::PreStone => "pre-stone",
            Era::Stone => "stone",
            Era::Bronze => "bronze",
            Era::Iron => "iron",
            Era::Classical => "classical",
            Era::Medieval => "medieval",
            Era::Renaissance => "renaissance",
            Era::Industrial => "industrial",
            Era::Modern => "modern",
            Era::Information => "information",
        }
    }

    pub fn required_discoveries(self) -> &'static [&'static str] {
        match self {
            Era::PreStone => &["foraging"],
            Era::Stone => &["fire", "stone_tools", "shelter"],
            Era::Bronze => &["smelting", "agriculture", "pottery"],
            Era::Iron => &["ironworking", "writing", "wheel"],
            Era::Classical => &["mathematics", "philosophy", "masonry"],
            Era::Medieval => &["feudalism", "mill", "plow"],
            Era::Renaissance => &["printing", "gunpowder", "astronomy"],
            Era::Industrial => &["steam_engine", "railroad", "factory"],
            Era::Modern => &["electricity", "internal_combustion", "antibiotics"],
            Era::Information => &["computer", "internet", "satellite"],
        }
    }

    pub fn advance(&self) -> Option<Era> {
        match self {
            Era::PreStone => Some(Era::Stone),
            Era::Stone => Some(Era::Bronze),
            Era::Bronze => Some(Era::Iron),
            Era::Iron => Some(Era::Classical),
            Era::Classical => Some(Era::Medieval),
            Era::Medieval => Some(Era::Renaissance),
            Era::Renaissance => Some(Era::Industrial),
            Era::Industrial => Some(Era::Modern),
            Era::Modern => Some(Era::Information),
            Era::Information => None,
        }
    }

    pub fn from_name(s: &str) -> Option<Era> {
        match s {
            "pre-stone" => Some(Era::PreStone),
            "stone" => Some(Era::Stone),
            "bronze" => Some(Era::Bronze),
            "iron" => Some(Era::Iron),
            "classical" => Some(Era::Classical),
            "medieval" => Some(Era::Medieval),
            "renaissance" => Some(Era::Renaissance),
            "industrial" => Some(Era::Industrial),
            "modern" => Some(Era::Modern),
            "information" => Some(Era::Information),
            _ => None,
        }
    }

    fn pop_threshold(self) -> usize {
        match self {
            Era::PreStone => 0,
            Era::Stone => 0,
            Era::Bronze => 3,
            Era::Iron => 6,
            Era::Classical => 10,
            Era::Medieval => 16,
            Era::Renaissance => 25,
            Era::Industrial => 40,
            Era::Modern => 60,
            Era::Information => 90,
        }
    }
}

pub fn determine_era_for_lineage(discoveries: &HashSet<String>, pop: usize) -> Era {
    let ladder = [
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
    ];
    let mut best = Era::PreStone;
    for era in ladder.iter().copied() {
        let has_all = era
            .required_discoveries()
            .iter()
            .all(|d| discoveries.contains(*d));
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
    fn bronze_with_bronze_prereqs_and_pop() {
        let mut d: HashSet<String> = HashSet::new();
        for x in ["fire", "stone_tools", "shelter", "smelting", "agriculture", "pottery"] {
            d.insert(x.to_string());
        }
        assert_eq!(determine_era_for_lineage(&d, 2), Era::Stone);
        assert_eq!(determine_era_for_lineage(&d, 3), Era::Bronze);
    }
}
