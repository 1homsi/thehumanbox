//! Fields follow the farmers who work them. A ripe crop nobody harvests rots
//! and goes to seed, a fallow plot nobody works goes back to the wild, a
//! vanished tribe's fields go first, and a tribe opens new ground only while
//! it has fewer plots than mouths. Before this every plot ever dug stayed on
//! the map: an old world had four for every person, most of them bare.

use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::tiles::Tile;
use rustc_hash::{FxHashMap, FxHashSet};

/// Ticks between field upkeep passes.
pub(crate) const FIELD_STEP: u64 = 300;
/// Ticks a ripe crop waits in the field before it rots.
pub(crate) const ROT_AFTER: u64 = 1_500;
/// Ticks a fallow plot lies unworked before it goes back to the wild.
pub(crate) const WILD_AFTER: u64 = 9_000;
/// Ticks before a vanished tribe's fallow plots go wild.
pub(crate) const ABANDONED_WILD_AFTER: u64 = 3_000;

/// Plots a tribe may keep: one per person and a few to rotate through.
pub(crate) fn plot_allowance(population: usize) -> usize {
    population + 4
}

/// True when a tribe may break new ground rather than reuse a plot it has.
pub(crate) fn can_open_new_plot(sim: &Simulation, lineage: &str) -> bool {
    let population = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage)
        .count();
    let plots = sim.farms.iter().filter(|f| f.owner_lineage == lineage).count();
    plots < plot_allowance(population)
}

/// Last time anyone did anything with a plot.
fn last_worked(farm: &crate::sim::agriculture::Farm) -> u64 {
    farm.planted_tick.max(farm.ready_tick)
}

pub(crate) fn tick_fields(sim: &mut Simulation) {
    let now = sim.tick_count;
    let mut population: FxHashMap<&str, usize> = FxHashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        *population.entry(o.lineage_id.as_str()).or_insert(0) += 1;
    }
    let living: FxHashSet<String> = population.keys().map(|l| l.to_string()).collect();
    let allowance: FxHashMap<String, usize> = population
        .iter()
        .map(|(l, &n)| (l.to_string(), plot_allowance(n)))
        .collect();

    // Ripe crops left standing rot, and the grain they drop seeds wild food.
    let mut rotted: FxHashMap<String, usize> = FxHashMap::default();
    let mut seeded = Vec::new();
    for farm in sim.farms.iter_mut() {
        if farm.is_mature(now) && now.saturating_sub(farm.ready_tick) >= ROT_AFTER {
            farm.harvested = true;
            farm.prepared = false;
            farm.ready_tick = now;
            seeded.push((farm.x, farm.y));
            if living.contains(&farm.owner_lineage) {
                *rotted.entry(farm.owner_lineage.clone()).or_insert(0) += 1;
            }
        }
    }
    for (x, y) in seeded {
        if sim.grid.get(x, y) == Tile::Grass {
            sim.grid.set(x, y, Tile::Food);
        }
    }

    // Fallow plots nobody works go back to the wild; a tribe with more plots
    // than it can use lets the longest-idle ones go first.
    let mut idle: Vec<(u64, usize)> = sim
        .farms
        .iter()
        .enumerate()
        .filter(|(_, f)| f.harvested && !f.prepared)
        .map(|(i, f)| (now.saturating_sub(last_worked(f)), i))
        .collect();
    idle.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    let mut kept: FxHashMap<String, usize> = FxHashMap::default();
    for f in &sim.farms {
        *kept.entry(f.owner_lineage.clone()).or_insert(0) += 1;
    }
    let mut wild: FxHashSet<usize> = FxHashSet::default();
    for (idle_for, i) in idle {
        let farm = &sim.farms[i];
        let owner = &farm.owner_lineage;
        let gone = !living.contains(owner);
        let surplus = kept.get(owner).copied().unwrap_or(0) > allowance.get(owner).copied().unwrap_or(0);
        let limit = if gone { ABANDONED_WILD_AFTER } else { WILD_AFTER };
        if idle_for >= limit || (surplus && idle_for >= ABANDONED_WILD_AFTER) {
            wild.insert(i);
            if let Some(n) = kept.get_mut(owner) {
                *n = n.saturating_sub(1);
            }
        }
    }
    if !wild.is_empty() {
        let mut i = 0;
        let mut soil = Vec::new();
        sim.farms.retain(|f| {
            let keep = !wild.contains(&i);
            if !keep {
                soil.push((f.x, f.y));
            }
            i += 1;
            keep
        });
        // Rested ground recovers a little as the wild takes it back.
        for (x, y) in soil {
            sim.grid.restore_fertility(x, y, 0.05);
        }
    }

    let mut rotted: Vec<(String, usize)> = rotted.into_iter().filter(|(_, n)| *n >= 3).collect();
    rotted.sort();
    for (lineage, n) in rotted {
        let name = sim
            .lineage_names
            .get(&lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut sim.events,
            now,
            "life",
            &name,
            &format!("let {n} ripe fields rot unharvested"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::sim::agriculture::{CropKind, Farm};

    fn person(id: usize, lineage: &str) -> Organism {
        let mut o = Organism::new(
            format!("p{id}"),
            format!("p{id}"),
            50.0,
            50.0,
            0,
            String::new(),
            lineage.to_string(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o
    }

    fn plot(id: u32, x: i32, owner: &str, ready: u64, harvested: bool) -> Farm {
        Farm {
            id,
            x,
            y: 60,
            owner_lineage: owner.to_string(),
            crop: CropKind::Wheat,
            planted_tick: ready.saturating_sub(1200),
            ready_tick: ready,
            harvested,
            prepared: false,
        }
    }

    fn world(people: usize) -> Simulation {
        let mut sim = Simulation::new(12);
        sim.organisms = (0..people).map(|i| person(i, "clan")).collect();
        sim.farms.clear();
        sim.events.clear();
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        for x in 40..80 {
            sim.grid.set(x, 60, Tile::Grass);
        }
        sim
    }

    fn pass(sim: &mut Simulation, ticks: u64) {
        let end = sim.tick_count + ticks;
        while sim.tick_count < end {
            sim.tick_count += FIELD_STEP;
            tick_fields(sim);
        }
    }

    #[test]
    fn ripe_crops_left_standing_rot_and_go_to_seed() {
        let mut sim = world(4);
        sim.tick_count = 10_000;
        for i in 0..3 {
            sim.farms.push(plot(i + 1, 40 + i as i32, "clan", 10_000, false));
        }
        pass(&mut sim, ROT_AFTER - FIELD_STEP);
        assert!(sim.farms.iter().all(|f| !f.harvested), "rotted too soon");
        pass(&mut sim, FIELD_STEP * 2);
        assert!(sim.farms.iter().all(|f| f.harvested), "ripe crops waited forever");
        assert_eq!(
            sim.grid.get(40, 60),
            Tile::Food,
            "the rotted grain seeded nothing"
        );
        assert!(sim
            .events
            .iter()
            .any(|e| e.actor == "Ashfolk" && e.detail == "let 3 ripe fields rot unharvested"));
    }

    #[test]
    fn idle_fallow_goes_wild_and_a_vanished_tribes_fields_go_first() {
        let mut sim = world(4);
        sim.tick_count = 20_000;
        sim.farms.push(plot(1, 40, "clan", 20_000, true));
        sim.farms.push(plot(2, 41, "gone", 20_000, true));
        pass(&mut sim, ABANDONED_WILD_AFTER + FIELD_STEP);
        let ids: Vec<u32> = sim.farms.iter().map(|f| f.id).collect();
        assert_eq!(ids, vec![1], "the vanished tribe's field should go wild first");
        pass(&mut sim, WILD_AFTER);
        assert!(sim.farms.is_empty(), "an unworked fallow plot never went wild");
    }

    #[test]
    fn a_tribe_breaks_new_ground_only_while_it_needs_more_fields() {
        let mut sim = world(2);
        for i in 0..plot_allowance(2) as u32 {
            assert!(can_open_new_plot(&sim, "clan"));
            sim.farms.push(plot(i + 1, 40 + i as i32, "clan", 0, false));
        }
        assert!(!can_open_new_plot(&sim, "clan"));
    }

    #[test]
    fn a_shrunken_tribe_lets_its_spare_fields_go_sooner() {
        let mut sim = world(1);
        sim.tick_count = 30_000;
        for i in 0..10 {
            sim.farms.push(plot(i + 1, 40 + i as i32, "clan", 30_000, true));
        }
        pass(&mut sim, ABANDONED_WILD_AFTER + FIELD_STEP);
        assert_eq!(sim.farms.len(), plot_allowance(1));
    }
}
