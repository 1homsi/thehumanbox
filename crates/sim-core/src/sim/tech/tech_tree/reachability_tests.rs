use super::*;
use crate::hashing::FxHashSet;
use crate::sim::civ::eras::LADDER;

/// Every secret an age asks for must be a real node whose prerequisites,
/// all the way back, are real nodes too: otherwise no tribe can ever
/// learn it and the age is out of reach for good.
#[test]
fn every_age_can_be_reached_from_the_first_discoveries() {
    let tech = all_tech();
    let mut known: FxHashSet<&str> = ["foraging", "fire", "shelter", "stone_tools"]
        .into_iter()
        .collect();
    let mut changed = true;
    while changed {
        changed = false;
        for node in tech.iter() {
            if !known.contains(node.name) && node.prerequisites.iter().all(|p| known.contains(p)) {
                known.insert(node.name);
                changed = true;
            }
        }
    }
    for era in LADDER {
        for d in era.required_discoveries() {
            assert!(
                tech.iter().any(|n| n.name == *d),
                "{} asks for {d}, which is not a technology",
                era.name()
            );
            assert!(known.contains(d), "{d} (for {}) can never be learned", era.name());
        }
    }
    for node in tech.iter() {
        assert!(known.contains(node.name), "{} can never be learned", node.name);
    }
}

/// A later age must not be harder to learn for than a much earlier one
/// by an order of magnitude, or tribes stall at the first slow one.
#[test]
fn the_far_future_is_not_starved_of_discovery() {
    for node in all_tech()
        .iter()
        .filter(|n| n.era >= crate::sim::civ::eras::Era::Digital)
    {
        assert!(
            node.discovery_rate >= 0.3,
            "{} is so rare ({}) it holds up every age after it",
            node.name,
            node.discovery_rate
        );
    }
}
