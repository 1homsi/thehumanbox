//! Berry bushes and mushrooms: how they are planted, ripen and regrow.

use super::plantings::{PlantKind, PLANT_STEP_TICKS};
use crate::sim::simulation::Simulation;
use crate::world::grid::WorldGrid;
use crate::world::tiles::{Biome, Tile};

fn flat_sim(biome: Biome) -> Simulation {
    let mut sim = Simulation::new(7);
    for y in 80..120 {
        for x in 80..120 {
            sim.grid.set(x, y, Tile::Grass);
            let i = WorldGrid::idx(x, y);
            sim.grid.biome[i] = biome as u8;
            sim.grid.fertility[i] = 0.8;
        }
    }
    sim.organisms.clear();
    sim.plantings.clear();
    sim.drought.active = false;
    sim
}

fn run(sim: &mut Simulation, steps: u64) {
    for _ in 0..steps {
        sim.tick_count += PLANT_STEP_TICKS;
        sim.tick_plantings();
    }
}

#[test]
fn every_plant_kind_has_its_own_name_and_id() {
    let names = ["crop", "orchard", "sapling", "flower", "berry", "mushroom"];
    let mut ids = Vec::new();
    for name in names {
        let kind = PlantKind::parse(name).unwrap_or_else(|| panic!("{name} parses"));
        ids.push(kind.id());
    }
    assert_eq!(PlantKind::parse("bush"), Some(PlantKind::Berry));
    assert_eq!(PlantKind::parse("mushrooms"), Some(PlantKind::Mushroom));
    let mut unique = ids.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), ids.len(), "ids are unique: {ids:?}");
}

#[test]
fn berry_bushes_fruit_then_fruit_again_after_being_picked() {
    let mut sim = flat_sim(Biome::Grassland);
    assert!(sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"berry","radius":0}"#));
    let i = WorldGrid::idx(100, 100) as u32;
    run(&mut sim, 120);
    assert!(sim.plantings[&i].ripe, "the bush fruits");
    assert_eq!(sim.grid.get(100, 100), Tile::Food);
    sim.grid.set(100, 100, Tile::Grass);
    run(&mut sim, 1);
    let p = &sim.plantings[&i];
    assert!(!p.ripe);
    assert_eq!(p.harvests, 1);
}

#[test]
fn mushrooms_only_take_root_in_shade() {
    let mut open = flat_sim(Biome::Grassland);
    assert!(!open.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"mushroom","radius":3}"#));
    assert!(open.plantings.is_empty(), "no mushrooms on open grassland");

    let mut wood = flat_sim(Biome::Forest);
    assert!(wood.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"mushroom","radius":3}"#));
    assert!(!wood.plantings.is_empty(), "mushrooms come up in the forest");
    assert!(wood.plantings.values().all(|p| p.kind == PlantKind::Mushroom));
}

#[test]
fn palms_take_root_only_near_water() {
    let mut inland = flat_sim(Biome::Grassland);
    assert!(!inland.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"palm","radius":2}"#));
    assert!(inland.plantings.is_empty(), "no palms far from water");

    let mut coast = flat_sim(Biome::Grassland);
    for y in 90..=110 {
        coast.grid.set(99, y, Tile::Water);
    }
    assert!(coast.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"palm","radius":2}"#));
    assert!(!coast.plantings.is_empty(), "palms come up by the water");
    assert!(coast.plantings.values().all(|p| p.kind == PlantKind::Palm));
}

#[test]
fn each_tree_matures_into_the_wood_of_its_own_kind() {
    for (name, kind, expected) in [
        ("oak", PlantKind::Oak, Biome::Forest),
        ("pine", PlantKind::Pine, Biome::Taiga),
    ] {
        let mut sim = flat_sim(Biome::Grassland);
        assert!(sim.apply_command_json(&format!(
            r#"{{"cmd":"plant","x":100,"y":100,"kind":"{name}","radius":0}}"#
        )));
        let i = WorldGrid::idx(100, 100) as u32;
        assert_eq!(sim.plantings[&i].kind, kind);
        run(&mut sim, 200);
        assert!(!sim.plantings.contains_key(&i), "{name} has matured");
        assert_eq!(sim.grid.biome_at(100, 100), expected, "{name} leaves its wood");
    }
    assert_eq!(PlantKind::parse("conifer"), Some(PlantKind::Pine));
    assert!(PlantKind::Palm.is_tree() && !PlantKind::Mushroom.is_tree());
}

#[test]
fn mushrooms_ripen_quicker_than_berries() {
    let mut sim = flat_sim(Biome::Forest);
    sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"mushroom","radius":0}"#);
    sim.apply_command_json(r#"{"cmd":"plant","x":104,"y":100,"kind":"berry","radius":0}"#);
    let mushroom = WorldGrid::idx(100, 100) as u32;
    let berry = WorldGrid::idx(104, 100) as u32;
    // About eleven growth points a step: a mushroom needs 400, a berry bush 600.
    run(&mut sim, 45);
    assert!(
        sim.plantings[&mushroom].ripe,
        "a mushroom is ready in a few hundred ticks"
    );
    assert!(!sim.plantings[&berry].ripe, "a berry bush is not yet");
}
