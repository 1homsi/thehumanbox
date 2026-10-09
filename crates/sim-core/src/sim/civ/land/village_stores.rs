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

use crate::hashing::FxHashSet;
use crate::sim::civ::land::village_fields::Tribe;
use crate::sim::civ::land::village_livestock;
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

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
/// Fields a village needs before it builds a watermill (from the Iron age, on a river bank).
const WATERMILL_MIN_PLOTS: usize = 2;
/// Livestock a village needs before it builds a barn.
const BARN_MIN_HEAD: usize = 2;
/// How far from a house a watermill may stand on a river bank, in tiles.
const WATER_REACH: i32 = 8;

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

/// True when the tribe has an operational building of this kind.
pub(crate) fn owns(sim: &Simulation, lineage: &str, kind: BuildingKind) -> bool {
    sim.buildings
        .iter()
        .any(|b| b.kind == kind && b.is_operational() && b.owner_lineage.as_deref() == Some(lineage))
}

/// The factor a tribe's harvest is multiplied by: a granary adds a quarter, a barn a fifth
/// (fodder and tools), and each mill half again: a watermill and a windmill grind separately.
pub(crate) fn yield_factor(sim: &Simulation, lineage: &str) -> f32 {
    let mut factor = 1.0;
    if owns(sim, lineage, BuildingKind::Granary) {
        factor += 0.25;
    }
    if owns(sim, lineage, BuildingKind::Barn) {
        factor += 0.2;
    }
    if owns(sim, lineage, BuildingKind::Windmill) {
        factor += 0.5;
    }
    if owns(sim, lineage, BuildingKind::Watermill) {
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

/// Builds a granary, then a barn once the herd and the fields are there, then a mill once
/// the era allows it: a watermill on a river bank when one is near the houses, otherwise a
/// windmill. One of each per tribe; the new building is complete at once.
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
    if has(sim, BuildingKind::Granary)
        && village_livestock::head_of(sim, &tribe.lineage) >= BARN_MIN_HEAD
        && !has(sim, BuildingKind::Barn)
    {
        place(sim, tribe, BuildingKind::Barn);
    }
    let era = sim.era(&tribe.lineage);
    if plots >= WATERMILL_MIN_PLOTS
        && era >= Era::Iron
        && has(sim, BuildingKind::Granary)
        && !has(sim, BuildingKind::Windmill)
        && !has(sim, BuildingKind::Watermill)
        && place_watermill(sim, tribe)
    {
        return;
    }
    // A windmill comes once the Medieval era does, beside a watermill too: a river village that
    // built its watermill in the Iron age still grinds with a windmill (each mill adds its own share).
    if plots >= MILL_MIN_PLOTS
        && era >= Era::Medieval
        && has(sim, BuildingKind::Granary)
        && !has(sim, BuildingKind::Windmill)
    {
        place(sim, tribe, BuildingKind::Windmill);
    }
}

/// Builds a watermill on a river bank near the houses. False when no bank is near enough.
fn place_watermill(sim: &mut Simulation, tribe: &Tribe) -> bool {
    let occupied = occupied_tiles(sim);
    let Some((x, y)) = water_site(sim, &tribe.dwellings, &occupied) else {
        return false;
    };
    place_at(sim, tribe, BuildingKind::Watermill, x, y);
    true
}

/// Every tile a field or a building covers. A 2x2 pen or barn takes all four of its tiles, so a
/// new building cannot stand over a neighbour's footprint (its sheep graze there).
fn occupied_tiles(sim: &Simulation) -> FxHashSet<(i32, i32)> {
    let mut tiles: FxHashSet<(i32, i32)> = sim.farms.iter().map(|f| (f.x, f.y)).collect();
    for b in &sim.buildings {
        let (fw, fh) = b.kind.footprint();
        for dy in 0..fh as i32 {
            for dx in 0..fw as i32 {
                tiles.insert((b.x + dx, b.y + dy));
            }
        }
    }
    tiles
}

/// True when every tile a building of `kind` would cover, from its origin `(x, y)`, is open grass.
fn fits(sim: &Simulation, x: i32, y: i32, kind: BuildingKind, occupied: &FxHashSet<(i32, i32)>) -> bool {
    let (fw, fh) = kind.footprint();
    (0..fh as i32).all(|dy| (0..fw as i32).all(|dx| open_grass(sim, x + dx, y + dy, occupied)))
}

pub(crate) fn place(sim: &mut Simulation, tribe: &Tribe, kind: BuildingKind) {
    let occupied = occupied_tiles(sim);
    let Some((x, y)) = site(sim, &tribe.dwellings, kind, &occupied) else {
        return;
    };
    place_at(sim, tribe, kind, x, y);
}

fn place_at(sim: &mut Simulation, tribe: &Tribe, kind: BuildingKind, x: i32, y: i32) {
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
    let what = match kind {
        BuildingKind::Granary => "built a granary beside the houses to keep the harvest dry",
        BuildingKind::Pen => "fenced a pasture beside the houses for the wild animals",
        BuildingKind::Barn => "raised a barn for the fodder, the tools and the herd",
        BuildingKind::Watermill => "built a watermill on the river bank to grind the grain",
        _ => "raised a windmill to grind the grain",
    };
    crate::sim::world_events::push_event(&mut sim.events, tick, "build", &name, what);
}

/// The first open grass tile 2 to `WATER_REACH` tiles from a house that has water within two
/// tiles: a river bank for a watermill.
fn water_site(
    sim: &Simulation,
    dwellings: &[(i32, i32)],
    occupied: &FxHashSet<(i32, i32)>,
) -> Option<(i32, i32)> {
    let (near, far) = (BUILD_REACH.0, WATER_REACH);
    for &(hx, hy) in dwellings {
        for reach in near..=far {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    if dx.abs().max(dy.abs()) != reach {
                        continue;
                    }
                    let (x, y) = (hx + dx, hy + dy);
                    if fits(sim, x, y, BuildingKind::Watermill, occupied) && water_within(sim, x, y, 2) {
                        return Some((x, y));
                    }
                }
            }
        }
    }
    None
}

fn water_within(sim: &Simulation, x: i32, y: i32, reach: i32) -> bool {
    (-reach..=reach).any(|dy| (-reach..=reach).any(|dx| sim.grid.get(x + dx, y + dy) == Tile::Water))
}

/// True for open grass that is not a road and not taken by a field or a building.
fn open_grass(sim: &Simulation, x: i32, y: i32, occupied: &FxHashSet<(i32, i32)>) -> bool {
    x >= 0
        && y >= 0
        && (x as usize) < WIDTH
        && (y as usize) < HEIGHT
        && !occupied.contains(&(x, y))
        && matches!(sim.grid.get(x, y), Tile::Grass)
        && sim.grid.road_at(x, y) == crate::world::grid::ROAD_NONE
}

/// The first open grass tile 2 to 4 tiles from a house, off the roads and off the fields.
fn site(
    sim: &Simulation,
    dwellings: &[(i32, i32)],
    kind: BuildingKind,
    occupied: &FxHashSet<(i32, i32)>,
) -> Option<(i32, i32)> {
    let (near, far) = BUILD_REACH;
    for &(hx, hy) in dwellings {
        for reach in near..=far {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    if dx.abs().max(dy.abs()) != reach {
                        continue;
                    }
                    let (x, y) = (hx + dx, hy + dy);
                    if fits(sim, x, y, kind, occupied) {
                        return Some((x, y));
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_barn_never_stands_over_a_standing_pen() {
        // A 2x2 pen at (10, 10) covers (10..=11, 10..=11). A barn (2x2) starting at (9, 10) or
        // (11, 11) would overlap it: those sites must not fit. A clear site must still fit.
        let mut sim = Simulation::new(9);
        sim.farms.clear();
        sim.buildings.clear();
        for y in 8..16 {
            for x in 8..24 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.buildings
            .push(Building::new(1, BuildingKind::Pen, 10, 10, None, 0));
        let occupied = occupied_tiles(&sim);
        for tile in [(10, 10), (11, 10), (10, 11), (11, 11)] {
            assert!(occupied.contains(&tile), "the pen covers {tile:?}");
        }
        assert!(!fits(&sim, 9, 10, BuildingKind::Barn, &occupied));
        assert!(!fits(&sim, 11, 11, BuildingKind::Barn, &occupied));
        assert!(fits(&sim, 13, 13, BuildingKind::Barn, &occupied));
    }

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

    /// A tribe with one house at (120, 120) and open grass round it.
    fn tribe_by_a_house(seed: u64, water: &[(i32, i32)]) -> (Simulation, Tribe) {
        use crate::world::grid::WorldGrid;
        let mut sim = Simulation::new(seed);
        let lineage = "river-folk".to_string();
        for dy in -10..=10 {
            for dx in -10..=10 {
                sim.grid.set(120 + dx, 120 + dy, Tile::Grass);
                sim.grid.fertility[WorldGrid::idx(120 + dx, 120 + dy)] = 0.8;
            }
        }
        for &(x, y) in water {
            sim.grid.set(x, y, Tile::Water);
        }
        sim.farms.clear();
        sim.buildings.clear();
        let tribe = Tribe {
            lineage,
            members: Vec::new(),
            dwellings: vec![(120, 120)],
        };
        (sim, tribe)
    }

    #[test]
    fn a_watermill_stands_on_a_river_bank_and_only_there() {
        let (mut sim, tribe) = tribe_by_a_house(5_201, &[(124, 120), (124, 121)]);
        assert!(
            place_watermill(&mut sim, &tribe),
            "a bank is within reach of the house"
        );
        let mill = sim
            .buildings
            .iter()
            .find(|b| b.kind == BuildingKind::Watermill)
            .expect("a watermill is built");
        assert!(
            water_within(&sim, mill.x, mill.y, 2),
            "the mill is beside the water"
        );
        assert_eq!(
            yield_factor(&sim, &tribe.lineage),
            1.5,
            "a watermill adds half again"
        );

        let (mut dry, dry_tribe) = tribe_by_a_house(5_202, &[]);
        assert!(!place_watermill(&mut dry, &dry_tribe), "no river, no watermill");
        assert!(dry.buildings.is_empty());
    }

    #[test]
    fn a_barn_adds_a_fifth_to_the_harvest_on_top_of_the_granary() {
        let (mut sim, tribe) = tribe_by_a_house(5_203, &[]);
        sim.buildings.push(granary(1, &tribe.lineage, 0));
        assert_eq!(yield_factor(&sim, &tribe.lineage), 1.25);
        let mut barn = Building::new(2, BuildingKind::Barn, 130, 130, Some(tribe.lineage.clone()), 0);
        barn.condition = 1.0;
        sim.buildings.push(barn);
        assert!((yield_factor(&sim, &tribe.lineage) - 1.45).abs() < 1e-6);
    }

    #[test]
    fn a_medieval_farming_village_with_a_watermill_still_gets_a_windmill() {
        let (mut sim, tribe) = tribe_by_a_house(5_204, &[(124, 120), (124, 121)]);
        sim.buildings.push(granary(1, &tribe.lineage, 0));
        for i in 0..MILL_MIN_PLOTS as u32 {
            sim.farms.push(crate::sim::agriculture::Farm {
                id: i + 1,
                x: 116 + i as i32,
                y: 116,
                owner_lineage: tribe.lineage.clone(),
                crop: crate::sim::agriculture::CropKind::Wheat,
                planted_tick: 0,
                ready_tick: 100,
                harvested: false,
                prepared: false,
                season_timed: false,
            });
        }
        // The Iron-age watermill comes first, on the river bank.
        sim.lineage_eras.insert(tribe.lineage.clone(), Era::Iron);
        build_stores(&mut sim, &tribe);
        assert!(owns(&sim, &tribe.lineage, BuildingKind::Watermill));
        assert!(!owns(&sim, &tribe.lineage, BuildingKind::Windmill));
        // The Medieval era brings the windmill beside it, and each mill adds its own half.
        sim.lineage_eras.insert(tribe.lineage.clone(), Era::Medieval);
        build_stores(&mut sim, &tribe);
        assert!(owns(&sim, &tribe.lineage, BuildingKind::Windmill));
        assert!((yield_factor(&sim, &tribe.lineage) - 2.25).abs() < 1e-6);
        build_stores(&mut sim, &tribe);
        let mills = sim
            .buildings
            .iter()
            .filter(|b| matches!(b.kind, BuildingKind::Windmill | BuildingKind::Watermill))
            .count();
        assert_eq!(
            mills, 2,
            "one windmill and one watermill, however often the pass runs"
        );
    }
}
