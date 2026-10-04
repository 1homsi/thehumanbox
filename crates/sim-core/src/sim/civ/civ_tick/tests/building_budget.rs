//! Building caps, the functional budget and abandoned ruins.

use super::*;

#[test]
fn building_cap_prunes_scenery_without_erasing_civilization() {
    let mut sim = Simulation::new(0xB17D);
    sim.buildings.clear();

    let wonder = Building::new(1, BuildingKind::University, 10, 10, Some("lineage-a".into()), 1);
    let hospital = Building::new(2, BuildingKind::Hospital, 12, 10, Some("lineage-a".into()), 2);
    sim.buildings.push(wonder);
    sim.buildings.push(hospital);

    for id in 3..=1_600 {
        let mut prop = Building::new(
            id,
            BuildingKind::Bench,
            id as i32 % 100,
            id as i32 / 100,
            Some("lineage-a".into()),
            id as u64,
        );
        prop.condition = 1.0;
        prop.decorative = true;
        sim.buildings.push(prop);
    }

    cap_buildings(&mut sim);

    assert_eq!(sim.buildings.len(), 1_500);
    assert!(sim.buildings.iter().any(|building| building.id == 1));
    assert!(sim.buildings.iter().any(|building| building.id == 2));
}

#[test]
fn functional_building_budget_prevents_unbounded_world_growth() {
    let mut sim = Simulation::new(0xB01D);
    sim.buildings.clear();
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        sim.buildings.push(Building::new(
            id,
            BuildingKind::Hospital,
            id as i32 % 100,
            id as i32 / 100,
            Some("lineage-a".into()),
            id as u64,
        ));
    }
    for org in sim.organisms.iter_mut().filter(|org| org.alive) {
        org.lineage_id = "lineage-a".into();
    }

    tick_buildings_construct(&mut sim);

    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);
}

#[test]
fn abandoned_ruins_cannot_deadlock_the_functional_building_budget() {
    let mut sim = Simulation::new(0xB01E);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 240;
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        let mut ruin = Building::new(
            id,
            BuildingKind::Hospital,
            300 + id as i32 % 100,
            100 + id as i32 / 100,
            Some("extinct-lineage".into()),
            1,
        );
        ruin.condition = 1.0;
        ruin.damage = 1.0;
        sim.buildings.push(ruin);
    }
    sim.next_building_id = FUNCTIONAL_BUILDINGS_CAP as u32 + 1;

    let mut builder = test_org("builder", "Builder", "new-lineage", 10.0, 10.0);
    builder.age = builder.max_age / 2;
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);
    sim.grid.set(10, 10, crate::world::tiles::Tile::Grass);

    tick_buildings_construct(&mut sim);
    assert_eq!(
        sim.buildings.len(),
        FUNCTIONAL_BUILDINGS_CAP,
        "planning alone must not evict history before a funded project is selected"
    );
    assert!(try_start_building_at(
        &mut sim,
        "new-lineage",
        BuildingKind::Hut,
        10,
        10,
    ));
    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);
    assert!(sim
        .buildings
        .iter()
        .any(|building| building.kind == BuildingKind::Hut));
}

#[test]
fn failed_unfunded_construction_does_not_evict_abandoned_history() {
    let mut sim = Simulation::new(0xB020);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 240;
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        let mut ruin = Building::new(
            id,
            BuildingKind::Hospital,
            300 + id as i32 % 100,
            100 + id as i32 / 100,
            Some("extinct-lineage".into()),
            1,
        );
        ruin.condition = 1.0;
        ruin.damage = 1.0;
        sim.buildings.push(ruin);
    }
    let mut builder = test_org("builder", "Builder", "new-lineage", 10.0, 10.0);
    builder.age = builder.max_age / 2;
    builder.inv_wood = 0;
    builder.inv_stone = 0;
    builder.wealth = 0;
    sim.organisms.push(builder);
    sim.grid.set(10, 10, crate::world::tiles::Tile::Grass);

    assert!(!try_start_building_at(
        &mut sim,
        "new-lineage",
        BuildingKind::Hut,
        10,
        10,
    ));
    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);

    tick_buildings_construct(&mut sim);
    assert_eq!(
        sim.buildings.len(),
        FUNCTIONAL_BUILDINGS_CAP,
        "autonomous planning must also preserve ruins until a funded project succeeds"
    );
}

#[test]
fn active_rebuilds_and_ruined_wonders_are_never_abandoned() {
    let mut sim = Simulation::new(0xB01F);
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 1_000;

    let mut rebuilding = Building::new(1, BuildingKind::House, 10, 10, Some("lineage-a".into()), 1);
    rebuilding.condition = 1.0;
    rebuilding.damage = 0.8;
    rebuilding.ruined_at_tick = Some(1);
    rebuilding.last_repair_tick = Some(sim.tick_count - REPAIR_GRACE_TICKS);
    sim.buildings.push(rebuilding);

    let mut wonder = Building::new(2, BuildingKind::University, 20, 20, Some("lineage-a".into()), 1);
    wonder.condition = 1.0;
    wonder.damage = 1.0;
    wonder.ruined_at_tick = Some(1);
    sim.buildings.push(wonder);

    assert_eq!(prune_abandoned_ruins(&mut sim, usize::MAX), 0);
    assert_eq!(sim.buildings.len(), 2);
}

#[test]
fn old_ruins_persist_when_the_world_is_not_under_capacity_pressure() {
    let mut sim = Simulation::new(0xB021);
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 1_000;
    let mut ruin = Building::new(1, BuildingKind::House, 10, 10, None, 1);
    ruin.condition = 1.0;
    ruin.damage = 1.0;
    ruin.ruined_at_tick = Some(1);
    sim.buildings.push(ruin);

    cap_buildings(&mut sim);

    assert_eq!(sim.buildings.len(), 1);
    assert!(sim.buildings[0].is_ruined());
}

#[test]
fn building_population_gates_are_reachable_at_every_supported_world_size() {
    let authored_gates = [
        3usize, 6, 8, 10, 12, 15, 18, 22, 25, 30, 40, 45, 60, 70, 100, 120, 140, 160, 180, 220, 240, 450,
    ];
    for population_limit in [120, 350, 500, 1_000, 2_000, 5_000] {
        let lineage_capacity = natural_lineage_limit(population_limit).min(BASELINE_MAX_BUILDING_REQUIREMENT);
        let requirements: Vec<usize> = authored_gates
            .iter()
            .map(|base| construction_population_requirement(*base, population_limit))
            .collect();
        assert!(requirements.windows(2).all(|pair| pair[0] <= pair[1]));
        assert_eq!(requirements.last().copied(), Some(lineage_capacity));

        let existing: HashSet<BuildingKind> = BuildingKind::all()
            .iter()
            .copied()
            .filter(|kind| *kind != BuildingKind::Megastructure)
            .collect();
        assert_eq!(
            next_target_building(Era::Galactic, lineage_capacity, population_limit, &existing),
            Some(BuildingKind::Megastructure),
            "Galactic construction should remain reachable at cap {population_limit}"
        );
    }
    assert_eq!(construction_population_requirement(40, 350), 40);
}
