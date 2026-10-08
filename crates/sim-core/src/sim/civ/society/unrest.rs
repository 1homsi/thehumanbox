//! Unrest. A tribe whose wealth is stark (see `inequality.rs`) and where most
//! people hold one piece of wealth or less builds unrest a little each day.
//! When it reaches the threshold the poor rise up: the richest person's
//! wealth is halved and shared among the poor, and the chronicle records it.
//! A tribe that is not stark (or no longer mostly poor) calms down.

use super::inequality::{lineage_inequality, STARK_GINI};
use crate::sim::simulation::Simulation;
use rustc_hash::FxHashMap as HashMap;

/// Unrest a stark, mostly-poor tribe builds up each day.
pub const UNREST_PER_DAY: f32 = 0.2;
/// Unrest at which the poor rise up.
pub const UNREST_THRESHOLD: f32 = 1.0;
/// Unrest a tribe calms by each day it is not stark and mostly poor.
const UNREST_CALM_PER_DAY: f32 = 0.1;
/// Share of people who must be poor for the poor to rise.
const POOR_SHARE: f32 = 0.5;
/// Fewest living people in a tribe for unrest to count.
const MIN_PEOPLE_FOR_UNREST: usize = 8;

/// Once a day: builds or calms unrest in each tribe and rises up when it
/// reaches the threshold. Tribes are visited in id order, so the result is the
/// same on every run.
pub(crate) fn tick_unrest(sim: &mut Simulation, tick: u64) {
    let rows = lineage_inequality(&sim.organisms);
    let gap: HashMap<String, (f32, usize)> = rows
        .iter()
        .map(|(lid, gini, people)| (lid.clone(), (*gini, *people)))
        .collect();
    let mut lineages: Vec<String> = sim
        .lineage_unrest
        .keys()
        .cloned()
        .chain(gap.keys().cloned())
        .collect();
    lineages.sort();
    lineages.dedup();
    for lid in lineages {
        let (gini, people) = gap.get(&lid).copied().unwrap_or((0.0, 0));
        let poor: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lid && o.wealth <= 1)
            .map(|(i, _)| i)
            .collect();
        let mostly_poor = people >= MIN_PEOPLE_FOR_UNREST
            && gini >= STARK_GINI
            && poor.len() as f32 >= POOR_SHARE * people as f32;
        if !mostly_poor {
            if let Some(u) = sim.lineage_unrest.get_mut(&lid) {
                *u = (*u - UNREST_CALM_PER_DAY).max(0.0);
            }
            continue;
        }
        let u = sim.lineage_unrest.entry(lid.clone()).or_insert(0.0);
        *u += UNREST_PER_DAY;
        if *u >= UNREST_THRESHOLD {
            *u = 0.0;
            rise_up(sim, &lid, &poor, tick);
        }
    }
    sim.lineage_unrest.retain(|_, u| *u > 0.0);
}

/// The poor of a tribe take half of the richest person's wealth and share it.
fn rise_up(sim: &mut Simulation, lid: &str, poor: &[usize], tick: u64) {
    let richest = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.lineage_id == lid)
        .max_by(|(ai, a), (bi, b)| a.wealth.cmp(&b.wealth).then(bi.cmp(ai)))
        .map(|(i, _)| i);
    let Some(rich) = richest else { return };
    let taken = sim.organisms[rich].wealth / 2;
    if taken == 0 || poor.is_empty() {
        return;
    }
    sim.organisms[rich].wealth -= taken;
    let share = (taken / poor.len() as u32).max(1);
    let mut left = taken;
    for &p in poor {
        if left == 0 {
            break;
        }
        let give = share.min(left);
        sim.organisms[p].wealth = sim.organisms[p].wealth.saturating_add(give);
        left -= give;
    }
    let rich_name = sim.organisms[rich].name.clone();
    let tribe = sim
        .lineage_names
        .get(lid)
        .cloned()
        .unwrap_or_else(|| "a tribe".into());
    let detail = format!("the poor of {tribe} rose up and shared out the wealth of {rich_name}");
    crate::sim::world_events::push_event(&mut sim.events, tick, "rebellion", &tribe, &detail);
    sim.headlines.push_back((tick, format!("\u{270A} {detail}.")));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    fn person(id: &str, lid: &str, wealth: u32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            "x".into(),
            0.0,
            0.0,
            0,
            String::new(),
            lid.into(),
            9000,
            Traits::default(),
        );
        o.alive = true;
        o.wealth = wealth;
        o
    }

    #[test]
    fn a_stark_tribe_with_a_poor_majority_rises_and_shares_the_wealth() {
        let mut sim = Simulation::new(4);
        sim.organisms.clear();
        sim.events.clear();
        sim.organisms.push(person("rich", "stark", 40));
        for i in 0..9 {
            sim.organisms.push(person(&format!("poor{i}"), "stark", 0));
        }
        let mut day = 0u64;
        while !sim.events.iter().any(|e| e.etype == "rebellion") && day < 50 {
            day += 1;
            tick_unrest(&mut sim, day * crate::sim::cosmos::DAY_LENGTH);
        }
        assert!(
            sim.events.iter().any(|e| e.etype == "rebellion"),
            "the poor rise after {day} days"
        );
        assert!(
            sim.organisms[0].wealth < 40,
            "the richest person lost some wealth"
        );
        let poor_total: u32 = sim.organisms[1..].iter().map(|o| o.wealth).sum();
        assert!(poor_total > 0, "the poor received a share");
        assert!(day >= 5, "unrest builds over days, not at once");
    }

    #[test]
    fn an_even_tribe_never_rises() {
        let mut sim = Simulation::new(4);
        sim.organisms.clear();
        sim.events.clear();
        for i in 0..9 {
            sim.organisms.push(person(&format!("p{i}"), "even", 3));
        }
        for day in 1..=60u64 {
            tick_unrest(&mut sim, day * crate::sim::cosmos::DAY_LENGTH);
        }
        assert!(!sim.events.iter().any(|e| e.etype == "rebellion"));
        assert!(sim.lineage_unrest.is_empty());
    }
}
