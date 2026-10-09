//! Village stores. A tribe that farms builds a granary beside its houses once it has
//! a few fields, and a windmill later, once it has the Medieval era. The harvest of
//! its fields goes into the granary (up to a cap per granary) instead of the hands of
//! whoever brought it in; a granary raises each harvest by a quarter and a windmill by
//! half again. People with no food of their own take a ration from the stores each
//! village pass, so a hungry tribe lives on what it has stored.
//!
//! The stock is kept on the granary itself (`Building::stock`), so it saves with the
//! world. Everything here walks buildings and people in a fixed order and draws no
//! random numbers.

use crate::sim::civ::land::village_fields::Tribe;
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;
use rustc_hash::FxHashSet;

/// Measures of grain one granary holds.
pub(crate) const GRANARY_CAP: u32 = 60;
/// Most rations one village takes from its stores in one pass.
const RATIONS_PER_PASS: usize = 4;
/// Fields a village needs before it builds a granary.
const GRANARY_MIN_PLOTS: usize = 1;
/// Fields a village needs before it builds a windmill (and the era for it).
const MILL_MIN_PLOTS: usize = 4;
/// How far from a house a granary or a mill may stand, in tiles.
const BUILD_REACH: (i32, i32) = (2, 4);

/// Grain in a tribe's operational granaries.
pub(crate) fn stock_of(sim: &Simulation, lineage: &str) -> u32 {
    sim.buildings
        .iter()
        .filter(|b| {
            b.kind == BuildingKind::Granary
                && b.is_operational()
                && b.owner_lineage.as_deref() == Some(lineage)
        })
        .map(|b| b.stock)
        .sum()
}

/// The stock every tribe holds, as (lineage, measures), sorted by lineage. Only tribes
/// that hold any grain are listed.
pub(crate) fn food_stores(sim: &Simulation) -> Vec<(String, u32)> {
    let mut by_tribe: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
    for b in sim.buildings.iter() {
        if b.kind == BuildingKind::Granary && b.is_operational() && b.stock > 0 {
            if let Some(owner) = b.owner_lineage.as_deref() {
                *by_tribe.entry(owner.to_string()).or_insert(0) += b.stock;
            }
        }
    }
    by_tribe.into_iter().collect()
}

/// The factor a tribe's harvest is multiplied by: a granary adds a quarter, a windmill
/// half again.
pub(crate) fn yield_factor(sim: &Simulation, lineage: &str) -> f32 {
    let mut factor = 1.0;
    let has = |kind: BuildingKind| {
        sim.buildings
            .iter()
            .any(|b| b.kind == kind && b.is_operational() && b.owner_lineage.as_deref() == Some(lineage))
    };
    if has(BuildingKind::Granary) {
        factor += 0.25;
    }
    if has(BuildingKind::Windmill) {
        factor += 0.5;
    }
    factor
}

/// Puts grain into the tribe's granaries, the first with room first. Returns the grain
/// that did not fit.
pub(crate) fn deposit(sim: &mut Simulation, lineage: &str, mut grain: u32) -> u32 {
    for b in sim.buildings.iter_mut() {
        if grain == 0 {
            break;
        }
        if b.kind == BuildingKind::Granary
            && b.is_operational()
            && b.owner_lineage.as_deref() == Some(lineage)
        {
            let room = GRANARY_CAP.saturating_sub(b.stock);
            let put = room.min(grain);
            b.stock += put;
            grain -= put;
        }
    }
    grain
}

/// People with no food of their own take a ration from the stores, lowest index first.
pub(crate) fn ration(sim: &mut Simulation, tribe: &Tribe) {
    if stock_of(sim, &tribe.lineage) == 0 {
        return;
    }
    let mut taken = 0usize;
    for &idx in &tribe.members {
        if taken >= RATIONS_PER_PASS {
            break;
        }
        if sim.organisms[idx].inv_food > 0 || !take_one(sim, &tribe.lineage) {
            continue;
        }
        let tick = sim.tick_count;
        sim.organisms[idx].inv_food = 1;
        sim.organisms[idx].think("eating from the granary", tick);
        taken += 1;
    }
}

fn take_one(sim: &mut Simulation, lineage: &str) -> bool {
    for b in sim.buildings.iter_mut() {
        if b.kind == BuildingKind::Granary
            && b.is_operational()
            && b.owner_lineage.as_deref() == Some(lineage)
            && b.stock > 0
        {
            b.stock -= 1;
            return true;
        }
    }
    false
}

/// Builds a granary, and then a windmill once the era allows it, beside a house. One of
/// each per tribe; the new building is complete at once.
pub(crate) fn build_stores(sim: &mut Simulation, tribe: &Tribe) {
    let plots = sim
        .farms
        .iter()
        .filter(|f| f.owner_lineage == tribe.lineage)
        .count();
    let has = |sim: &Simulation, kind: BuildingKind| {
        sim.buildings
            .iter()
            .any(|b| b.kind == kind && b.owner_lineage.as_deref() == Some(tribe.lineage.as_str()))
    };
    if plots >= GRANARY_MIN_PLOTS && !has(sim, BuildingKind::Granary) {
        place(sim, tribe, BuildingKind::Granary);
    }
    if plots >= MILL_MIN_PLOTS
        && sim.era(&tribe.lineage) >= Era::Medieval
        && has(sim, BuildingKind::Granary)
        && !has(sim, BuildingKind::Windmill)
    {
        place(sim, tribe, BuildingKind::Windmill);
    }
}

fn place(sim: &mut Simulation, tribe: &Tribe, kind: BuildingKind) {
    let occupied: FxHashSet<(i32, i32)> = sim
        .farms
        .iter()
        .map(|f| (f.x, f.y))
        .chain(sim.buildings.iter().map(|b| (b.x, b.y)))
        .collect();
    let Some((x, y)) = site(sim, &tribe.dwellings, &occupied) else {
        return;
    };
    let id = sim
        .buildings
        .iter()
        .map(|b| b.id)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    let tick = sim.tick_count;
    let mut building = Building::new(id, kind, x, y, Some(tribe.lineage.clone()), tick);
    building.condition = 1.0;
    sim.buildings.push(building);
    let name = sim
        .lineage_names
        .get(&tribe.lineage)
        .cloned()
        .unwrap_or_else(|| "a tribe".to_string());
    let what = if kind == BuildingKind::Granary {
        "built a granary beside the houses to keep the harvest dry"
    } else {
        "raised a windmill to grind the grain"
    };
    crate::sim::world_events::push_event(&mut sim.events, tick, "build", &name, what);
}

/// The first open grass tile 2 to 4 tiles from a house, off the roads and off the fields.
fn site(sim: &Simulation, dwellings: &[(i32, i32)], occupied: &FxHashSet<(i32, i32)>) -> Option<(i32, i32)> {
    let (near, far) = BUILD_REACH;
    for &(hx, hy) in dwellings {
        for reach in near..=far {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    if dx.abs().max(dy.abs()) != reach {
                        continue;
                    }
                    let (x, y) = (hx + dx, hy + dy);
                    if x < 0 || y < 0 || (x as usize) >= WIDTH || (y as usize) >= HEIGHT {
                        continue;
                    }
                    if occupied.contains(&(x, y))
                        || !matches!(sim.grid.get(x, y), Tile::Grass)
                        || sim.grid.road_at(x, y) != crate::world::grid::ROAD_NONE
                    {
                        continue;
                    }
                    return Some((x, y));
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn granary(id: u32, owner: &str, stock: u32) -> Building {
        let mut b = Building::new(
            id,
            BuildingKind::Granary,
            10 + id as i32,
            10,
            Some(owner.to_string()),
            0,
        );
        b.condition = 1.0;
        b.stock = stock;
        b
    }

    #[test]
    fn deposits_fill_granaries_in_order_and_return_the_rest() {
        let mut sim = Simulation::new(5_001);
        sim.buildings.clear();
        sim.buildings.push(granary(1, "t", 50));
        sim.buildings.push(granary(2, "t", 0));
        let left = deposit(&mut sim, "t", 30);
        assert_eq!(left, 0);
        assert_eq!(stock_of(&sim, "t"), 80);
        let left = deposit(&mut sim, "t", 100);
        assert_eq!(stock_of(&sim, "t"), 2 * GRANARY_CAP);
        assert_eq!(left, 100 - (2 * GRANARY_CAP - 80));
        assert_eq!(
            deposit(&mut sim, "other", 5),
            5,
            "another tribe's granary is no use"
        );
    }

    #[test]
    fn a_ruined_or_unfinished_granary_holds_nothing() {
        let mut sim = Simulation::new(5_002);
        sim.buildings.clear();
        let mut b = granary(1, "t", 0);
        b.condition = 0.4;
        sim.buildings.push(b);
        assert_eq!(deposit(&mut sim, "t", 10), 10);
        assert!(food_stores(&sim).is_empty());
    }

    #[test]
    fn stores_and_factors_follow_the_buildings_a_tribe_owns() {
        let mut sim = Simulation::new(5_003);
        sim.buildings.clear();
        sim.buildings.push(granary(1, "a", 12));
        sim.buildings.push(granary(2, "b", 7));
        assert_eq!(
            food_stores(&sim),
            vec![("a".to_string(), 12), ("b".to_string(), 7)]
        );
        assert!((yield_factor(&sim, "a") - 1.25).abs() < 1e-6);
        assert!((yield_factor(&sim, "c") - 1.0).abs() < 1e-6);
    }

    #[test]
    fn a_hungry_member_takes_a_ration_from_the_granary() {
        let mut sim = Simulation::new(5_004);
        sim.buildings.clear();
        sim.buildings.push(granary(1, "t", 3));
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].lineage_id = "t".to_string();
        sim.organisms[idx].inv_food = 0;
        let tribe = Tribe {
            lineage: "t".to_string(),
            members: vec![idx],
            dwellings: Vec::new(),
        };
        ration(&mut sim, &tribe);
        assert_eq!(sim.organisms[idx].inv_food, 1);
        assert_eq!(stock_of(&sim, "t"), 2);
        ration(&mut sim, &tribe);
        assert_eq!(sim.organisms[idx].inv_food, 1, "someone with food takes none");
    }

    #[test]
    fn a_tribe_with_two_fields_and_a_house_builds_one_granary_beside_it() {
        let mut sim = Simulation::new(5_005);
        sim.buildings.clear();
        sim.farms.clear();
        for dy in -6..=6 {
            for dx in -6..=6 {
                sim.grid.set(120 + dx, 120 + dy, Tile::Grass);
            }
        }
        let mut house = Building::new(1, BuildingKind::Hut, 120, 120, Some("t".to_string()), 0);
        house.condition = 1.0;
        sim.buildings.push(house);
        for i in 0..2 {
            sim.farms.push(crate::sim::agriculture::Farm {
                id: i + 1,
                x: 130 + i as i32,
                y: 130,
                owner_lineage: "t".to_string(),
                crop: crate::sim::agriculture::CropKind::Wheat,
                planted_tick: 0,
                ready_tick: 100,
                harvested: false,
                prepared: false,
                season_timed: false,
            });
        }
        let tribe = Tribe {
            lineage: "t".to_string(),
            members: Vec::new(),
            dwellings: vec![(120, 120)],
        };
        build_stores(&mut sim, &tribe);
        build_stores(&mut sim, &tribe);
        let granaries: Vec<&Building> = sim
            .buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::Granary && b.owner_lineage.as_deref() == Some("t"))
            .collect();
        assert_eq!(
            granaries.len(),
            1,
            "one granary per tribe, however often the pass runs"
        );
        assert!(granaries[0].is_operational());
        assert!((granaries[0].x - 120).abs().max((granaries[0].y - 120).abs()) >= BUILD_REACH.0);
    }
}
