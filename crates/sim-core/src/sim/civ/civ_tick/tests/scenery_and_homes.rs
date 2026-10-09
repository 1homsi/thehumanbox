//! Scenery, prop scattering, home placement and housing demand.

use super::*;

#[test]
fn scenery_respects_full_footprints_water_and_legacy_buildings() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(703);
    sim.buildings.clear();
    for y in 20..50 {
        for x in 20..50 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let home = Building::new(1, BuildingKind::House, 30, 30, None, 0);
    sim.buildings.push(home);
    for (id, x, y) in [(2, 31, 31), (3, 35, 35), (4, 35, 35), (5, 40, 40)] {
        let mut prop = Building::new(id, BuildingKind::Garden, x, y, None, 0);
        prop.decorative = true;
        sim.buildings.push(prop);
    }
    sim.grid.set(41, 41, Tile::Water);
    let revision = sim.building_state_revision;
    let occupied = reconcile_prop_sites(&mut sim);
    assert_eq!(sim.buildings.iter().map(|b| b.id).collect::<Vec<_>>(), vec![1, 3]);
    assert_ne!(sim.building_state_revision, revision);
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        29,
        29
    ));
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        40,
        40
    ));
    assert!(prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        43,
        43
    ));
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        -1,
        30
    ));
}

#[test]
fn repeated_prop_scattering_never_stacks_same_tick_or_later_props() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(706);
    sim.buildings.clear();
    sim.organisms.clear();
    for y in 20..60 {
        for x in 20..60 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for clan in ["first", "second"] {
        for i in 0..3 {
            sim.organisms
                .push(test_org(&format!("{clan}-{i}"), "Resident", clan, 40.0, 40.0));
        }
    }
    for _ in 0..30 {
        tick_scatter_props(&mut sim);
    }
    assert!(!sim.buildings.is_empty());
    let mut occupied = HashSet::default();
    for b in &sim.buildings {
        for tile in footprint_cells(b.kind, b.x, b.y) {
            assert!(occupied.insert(tile), "overlapping prop at {tile:?}");
        }
    }
}

#[test]
fn automatic_homes_leave_lanes_but_exact_placement_can_connect_walls() {
    let mut sim = Simulation::new(704);
    sim.buildings.clear();
    sim.buildings
        .push(Building::new(1, BuildingKind::House, 30, 30, None, 0));
    assert!(!automatic_site_has_clearance(&sim, BuildingKind::House, 32, 30));
    assert!(!automatic_site_has_clearance(&sim, BuildingKind::House, 30, 33));
    assert!(automatic_site_has_clearance(&sim, BuildingKind::House, 33, 30));
    assert!(automatic_site_has_clearance(&sim, BuildingKind::Wall, 32, 30));
}

#[test]
fn small_settlements_finish_existing_projects_before_starting_more() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(705);
    sim.buildings.clear();
    sim.organisms.clear();
    for y in 20..60 {
        for x in 20..60 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for i in 0..4 {
        let mut worker = test_org(&format!("worker-{i}"), "Worker", "clan", 40.0, 40.0);
        worker.age = worker.max_age / 2;
        worker.inv_wood = 100;
        worker.inv_stone = 100;
        worker.wealth = 1000;
        sim.organisms.push(worker);
    }
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        40,
        40,
        Some("clan".into()),
        0,
    ));
    let wood = sim.organisms[0].inv_wood;
    tick_buildings_construct(&mut sim);
    assert_eq!(sim.buildings.len(), 1);
    assert_eq!(sim.organisms[0].inv_wood, wood);
}

#[test]
fn housing_demand_counts_pending_homes_but_not_ruins_or_scenery() {
    let mut sim = Simulation::new(703);
    sim.buildings.clear();
    let owner = sim.organisms[0].lineage_id.clone();
    sim.organisms[0].inv_wood = 100;
    sim.organisms[0].inv_stone = 100;
    sim.organisms[0].wealth = 1000;
    assert_eq!(
        housing_target(&sim, &owner, Era::Stone, 4),
        Some(BuildingKind::Hut)
    );
    let mut b = Building::new(1, BuildingKind::House, 30, 30, Some(owner.clone()), 0);
    sim.buildings.push(b.clone());
    assert_eq!(housing_target(&sim, &owner, Era::Bronze, 4), None);
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 8),
        Some(BuildingKind::House)
    );
    sim.buildings[0].damage = 1.0;
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 4),
        Some(BuildingKind::House)
    );
    b.decorative = true;
    sim.buildings.push(b);
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 4),
        Some(BuildingKind::House)
    );
    assert_eq!(housing_target(&sim, &owner, Era::PreStone, 4), None);
}

#[test]
fn a_tribe_that_can_pay_for_a_house_raises_one_and_fetches_stone_until_then() {
    let mut sim = Simulation::new(704);
    sim.buildings.clear();
    let owner = sim.organisms[0].lineage_id.clone();
    for org in sim.organisms.iter_mut().filter(|o| o.lineage_id == owner) {
        org.inv_wood = 0;
        org.inv_stone = 0;
        org.wealth = 0;
    }
    // Bronze has houses but the tribe holds no wood or stone: it fetches stone,
    // and no home is affordable until it has the materials for one.
    assert!(home_waits_for_house(&sim, &owner, Era::Bronze));
    assert_eq!(housing_target(&sim, &owner, Era::Bronze, 40), None);
    // With wood but no stone, a hut is the home raised while the stone is fetched.
    sim.organisms[0].inv_wood = 100;
    assert!(home_waits_for_house(&sim, &owner, Era::Bronze));
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 40),
        Some(BuildingKind::Hut)
    );
    // Wood and stone pay for a house, and the house is chosen.
    sim.organisms[0].inv_stone = 8;
    assert!(!home_waits_for_house(&sim, &owner, Era::Bronze));
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 40),
        Some(BuildingKind::House)
    );
    // The stone age never had houses, so a hut is still the home.
    sim.organisms[0].inv_stone = 0;
    assert!(!home_waits_for_house(&sim, &owner, Era::Stone));
    assert_eq!(
        housing_target(&sim, &owner, Era::Stone, 40),
        Some(BuildingKind::Hut)
    );
}
