//! Crop failure: what a blight, a swarm, a dry spell and a famine do to a village.

use super::*;
use crate::sim::agriculture::{CropKind, Farm};
use crate::sim::civ::land::village_fields::tick_village_fields;
use crate::sim::era::Era;
use crate::sim::tech::buildings::Building;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// Tick of a spring pass (season "recovery").
const SPRING: u64 = 9_000;

/// A tribe that farms by a house, with open grass round it and a granary holding `stock`.
fn farming_village(seed: u64, stock: u32) -> (Simulation, String, (i32, i32)) {
    let mut sim = Simulation::new(seed);
    let lineage = sim.organisms[0].lineage_id.clone();
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == lineage) {
        o.discoveries.insert("agriculture".to_string());
        o.inv_food = 0;
    }
    sim.lineage_eras.insert(lineage.clone(), Era::Bronze);
    let (hx, hy) = (120, 120);
    for dy in -12..=12 {
        for dx in -12..=12 {
            sim.grid.set(hx + dx, hy + dy, Tile::Grass);
            sim.grid.fertility[WorldGrid::idx(hx + dx, hy + dy)] = 0.8;
        }
    }
    sim.farms.clear();
    sim.buildings.clear();
    let mut house = Building::new(900, BuildingKind::Hut, hx, hy, Some(lineage.clone()), 0);
    house.condition = 1.0;
    sim.buildings.push(house);
    let mut granary = Building::new(
        901,
        BuildingKind::Granary,
        hx + 1,
        hy + 1,
        Some(lineage.clone()),
        0,
    );
    granary.condition = 1.0;
    granary.stock = stock;
    sim.buildings.push(granary);
    (sim, lineage, (hx, hy))
}

fn field(id: u32, x: i32, y: i32, owner: &str, ready: u64) -> Farm {
    Farm {
        id,
        x,
        y,
        owner_lineage: owner.to_string(),
        crop: CropKind::Wheat,
        planted_tick: ready - 1_200,
        ready_tick: ready,
        harvested: false,
        prepared: false,
        season_timed: true,
        withered: false,
    }
}

fn granary_stock(sim: &Simulation) -> u32 {
    sim.buildings
        .iter()
        .find(|b| b.kind == BuildingKind::Granary)
        .map(|b| b.stock)
        .unwrap_or(0)
}

fn chronicle(sim: &Simulation) -> Vec<String> {
    sim.events
        .iter()
        .map(|e| format!("{} {}", e.actor, e.detail))
        .collect()
}

fn tribe_of(sim: &Simulation, lineage: &str, dwelling: (i32, i32)) -> Tribe {
    Tribe {
        lineage: lineage.to_string(),
        members: sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.lineage_id == lineage)
            .map(|(i, _)| i)
            .collect(),
        dwellings: vec![dwelling],
    }
}

#[test]
fn a_blight_ruins_a_village_field_and_halves_the_granary() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_001, 40);
    sim.tick_count = 12_000;
    sim.farms.push(field(1, hx + 3, hy, &lineage, 15_000));
    let ruined = ruin(&mut sim, &[(hx, hy)], 6, Blow::Blight);
    assert_eq!(ruined, 1);
    assert!(sim.farms[0].withered, "the field stands dead");
    assert!(!sim.farms[0].harvested, "a ruined field keeps its place");
    assert_eq!(granary_stock(&sim), 20, "a blight spoils half the grain");
    assert!(chronicle(&sim)
        .iter()
        .any(|c| c.contains("a blight ruined 1 fields")));
}

#[test]
fn locusts_empty_the_granary_on_their_road_and_spare_the_rest() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_002, 40);
    sim.tick_count = 12_000;
    sim.farms.push(field(1, hx + 4, hy + 1, &lineage, 15_000));
    sim.farms.push(field(2, hx - 9, hy - 9, &lineage, 15_000));
    // The swarm passes the village field only; the far field and the granary stay off its road.
    assert_eq!(ruin(&mut sim, &[(hx + 4, hy)], 2, Blow::Locusts), 1);
    assert!(sim.farms[0].withered);
    assert!(!sim.farms[1].withered);
    assert_eq!(granary_stock(&sim), 40, "the granary is off the road");
    ruin(&mut sim, &[(hx + 1, hy + 1)], 2, Blow::Locusts);
    assert_eq!(granary_stock(&sim), 0, "a swarm over the granary empties it");
}

#[test]
fn a_dry_spell_wilts_unwatered_fields_and_spares_the_ones_by_water() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_003, 0);
    sim.drought.active = true;
    sim.tick_count = SPRING;
    let ready = SPRING + 6_000;
    // Plots 1..=20 are dry; plot 21 has water two tiles from it.
    for id in 1..=20u32 {
        sim.farms.push(field(
            id,
            hx + 4 + (id as i32 % 5),
            hy - 4 + (id as i32 / 5),
            &lineage,
            ready,
        ));
    }
    sim.farms.push(field(21, hx - 5, hy + 5, &lineage, ready));
    sim.grid.set(hx - 5, hy + 3, Tile::Water);
    let tribe = tribe_of(&sim, &lineage, (hx, hy));
    dry_spell(&mut sim, &tribe);
    let dry_wilted = sim.farms.iter().filter(|f| f.id <= 20 && f.withered).count();
    assert!(
        dry_wilted > 0 && dry_wilted < 20,
        "some dry fields wilt, not all: {dry_wilted}"
    );
    assert!(
        !sim.farms.iter().find(|f| f.id == 21).unwrap().withered,
        "a field by water lives"
    );
}

#[test]
fn a_ruined_field_gives_nothing_and_lies_fallow_until_it_is_sown_again() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_004, 0);
    let ready = 15_000;
    sim.farms.push(field(1, hx + 3, hy, &lineage, ready));
    sim.farms[0].withered = true;
    sim.tick_count = ready;
    let food_before: u32 = sim.organisms.iter().map(|o| o.inv_food as u32).sum::<u32>() + granary_stock(&sim);
    tick_village_fields(&mut sim);
    let food_after: u32 = sim.organisms.iter().map(|o| o.inv_food as u32).sum::<u32>() + granary_stock(&sim);
    assert!(sim.farms[0].harvested, "the dead field is cut down");
    assert!(!sim.farms[0].withered, "and cleared for the next sowing");
    assert_eq!(food_after, food_before, "a ruined field brings in no food");
    assert!(sim
        .organisms
        .iter()
        .any(|o| o.thought == "cutting down a ruined field"));
}

#[test]
fn an_empty_granary_after_a_failure_with_hungry_people_is_a_named_famine() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_005, 0);
    sim.tick_count = 12_000;
    sim.farms.push(field(1, hx + 3, hy, &lineage, 15_000));
    ruin(&mut sim, &[(hx + 3, hy)], 2, Blow::Blight);
    assert!(sim
        .buildings
        .iter()
        .any(|b| b.kind == BuildingKind::Granary && b.spoiled_tick.is_some()));
    let tribe = tribe_of(&sim, &lineage, (hx, hy));
    famine(&mut sim, &tribe);
    assert!(chronicle(&sim)
        .iter()
        .any(|c| c.contains("famine: the stores are empty")));
    assert!(
        sim.buildings.iter().all(|b| b.spoiled_tick.is_none()),
        "the warning is spent"
    );
}

#[test]
fn a_stocked_granary_after_a_failure_is_no_famine() {
    let (mut sim, lineage, (hx, hy)) = farming_village(6_006, 25);
    sim.tick_count = 12_000;
    sim.buildings
        .iter_mut()
        .for_each(|b| b.spoiled_tick = Some(11_900));
    let tribe = tribe_of(&sim, &lineage, (hx, hy));
    famine(&mut sim, &tribe);
    assert!(!chronicle(&sim).iter().any(|c| c.contains("famine")));
}
