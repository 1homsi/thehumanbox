//! Construction sites, labour, housing, bridges and infrastructure.

use super::*;

#[test]
fn devout_tribes_raise_a_place_of_worship_first() {
    let mut sim = Simulation::new(3);
    let lid = sim.organisms[0].lineage_id.clone();
    let none = HashSet::default();
    assert_eq!(
        devout_target(&sim, &lid, Era::Stone, 10, &none),
        None,
        "not devout yet"
    );
    sim.prayers.faith.insert(lid.clone(), DEVOUT_FAITH);
    assert_eq!(
        devout_target(&sim, &lid, Era::Stone, 10, &none),
        Some(BuildingKind::Shrine)
    );
    assert_eq!(
        devout_target(&sim, &lid, Era::Bronze, 40, &none),
        Some(BuildingKind::Temple)
    );
    let mut has_shrine = HashSet::default();
    has_shrine.insert(BuildingKind::Shrine);
    assert_eq!(devout_target(&sim, &lid, Era::Bronze, 40, &has_shrine), None);
    assert_eq!(construction_population_requirement(100, 350), 60);
    assert_eq!(construction_population_requirement(240, 500), 240);
}

#[test]
fn construction_reservation_is_atomic_and_charges_materials_and_wealth() {
    let mut sim = Simulation::new(0xC057);
    sim.organisms.clear();
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    let cost = BuildingKind::Factory.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth.saturating_sub(1);
    sim.organisms.push(builder);

    assert!(!reserve_construction_cost(
        &mut sim,
        "lineage-a",
        BuildingKind::Factory
    ));
    assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
    assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);

    sim.organisms[0].wealth = cost.wealth;
    assert!(reserve_construction_cost(
        &mut sim,
        "lineage-a",
        BuildingKind::Factory
    ));
    assert_eq!(sim.organisms[0].inv_wood, 0);
    assert_eq!(sim.organisms[0].inv_stone, 0);
    assert_eq!(sim.organisms[0].wealth, 0);
}

#[test]
fn invalid_construction_site_does_not_charge_the_lineage() {
    let mut sim = Simulation::new(0x51_7E);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);

    assert!(!try_start_building(
        &mut sim,
        "lineage-a",
        BuildingKind::Hut,
        -1_000,
        -1_000,
    ));
    assert!(sim.buildings.is_empty());
    assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
    assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);
    assert_eq!(sim.organisms[0].wealth, cost.wealth);
}

#[test]
fn fallback_construction_site_remains_within_worker_reach() {
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x51_7F);
    sim.organisms.clear();
    sim.buildings.clear();
    for y in 5..=15 {
        for x in 5..=35 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    builder.age = 10_000;
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);
    sim.buildings.push(Building::new(
        900,
        BuildingKind::Hut,
        28,
        10,
        Some("lineage-b".into()),
        0,
    ));

    assert!(try_start_building(
        &mut sim,
        "lineage-a",
        BuildingKind::Hut,
        28,
        10,
    ));
    let project = sim
        .buildings
        .iter()
        .find(|building| building.owner_lineage.as_deref() == Some("lineage-a"))
        .expect("reachable fallback project");
    let distance =
        (project.x as f32 - sim.organisms[0].x).abs() + (project.y as f32 - sim.organisms[0].y).abs();
    assert!(distance <= CONSTRUCTION_WORKER_REACH);
}

#[test]
fn builders_walk_to_the_site_before_contributing_labor() {
    let mut sim = Simulation::new(704);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("builder", "Builder", "lineage-a", 20.0, 10.0);
    worker.age = 10_000;
    sim.organisms.push(worker);
    sim.grid.set(9, 10, crate::world::tiles::Tile::Grass);
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));
    tick_building_progress(&mut sim);
    assert_eq!(sim.buildings[0].condition, 0.0);
    assert!(sim.organisms[0].journey.is_some());
    sim.organisms[0].x = 9.0;
    tick_building_progress(&mut sim);
    assert!(sim.buildings[0].condition > 0.0);
    assert!(sim.organisms[0].thought.contains("building a hut"));
}

#[test]
fn a_lone_crew_works_the_school_before_older_huts_and_wonders() {
    let mut sim = Simulation::new(0x5C01);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("worker", "Worker", "lineage-a", 10.0, 10.0);
    worker.age = 10_000;
    sim.organisms.push(worker);
    // The hut was started first and sits first in the list.
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.buildings.push(Building::new(
        2,
        BuildingKind::School,
        11,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.tick_count = 20;
    tick_building_progress(&mut sim);
    assert!(sim.buildings[1].condition > 0.0, "the school got no crew");
    assert_eq!(sim.buildings[0].condition, 0.0, "the hut took the only worker");
}

#[test]
fn a_lone_crew_finishes_the_market_before_an_older_wall_or_house() {
    let mut sim = Simulation::new(0x5C02);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("worker", "Worker", "lineage-a", 10.0, 10.0);
    worker.age = 10_000;
    sim.organisms.push(worker);
    // A wall and a house were started first; the market came after them.
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Wall,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.buildings.push(Building::new(
        2,
        BuildingKind::House,
        12,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.buildings.push(Building::new(
        3,
        BuildingKind::Market,
        11,
        10,
        Some("lineage-a".into()),
        10,
    ));
    sim.tick_count = 20;
    tick_building_progress(&mut sim);
    assert!(sim.buildings[2].condition > 0.0, "the market got no crew");
    assert_eq!(sim.buildings[0].condition, 0.0, "the wall took the only worker");
    assert_eq!(sim.buildings[1].condition, 0.0, "the house took the only worker");
}

#[test]
fn a_started_craft_or_civic_project_comes_first_until_it_is_too_old() {
    let mut sim = Simulation::new(0x5C03);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.tick_count = 1_000;
    assert!(!civic_project_first(&sim, "lineage-a"), "nothing started yet");
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Market,
        10,
        10,
        Some("lineage-a".into()),
        1_000,
    ));
    assert!(
        civic_project_first(&sim, "lineage-a"),
        "a fresh market holds back homes"
    );
    assert!(
        !civic_project_first(&sim, "lineage-b"),
        "another tribe's market does not"
    );
    sim.buildings[0].condition = 1.0;
    assert!(
        !civic_project_first(&sim, "lineage-a"),
        "a finished market no longer holds back homes"
    );
    sim.buildings[0].condition = 0.5;
    sim.buildings[0].built_at_tick = 1_000 - CIVIC_FIRST_TICKS - 1;
    assert!(
        !civic_project_first(&sim, "lineage-a"),
        "a project no builder finishes cannot stop housing"
    );
    sim.buildings[0].built_at_tick = 1_000 - CIVIC_FIRST_TICKS;
    assert!(civic_project_first(&sim, "lineage-a"));
    assert!(!is_civic_project(BuildingKind::House));
    assert!(is_home_kind(BuildingKind::House) && !is_home_kind(BuildingKind::Temple));
}

#[test]
fn builders_hand_out_crews_research_first_then_civic_then_the_rest() {
    assert_eq!(crew_rank(BuildingKind::School), 0);
    assert_eq!(crew_rank(BuildingKind::Temple), 1);
    assert_eq!(crew_rank(BuildingKind::Workshop), 1);
    assert_eq!(crew_rank(BuildingKind::Wall), 2);
    assert_eq!(crew_rank(BuildingKind::House), 2);
}

#[test]
fn the_research_building_a_tribe_lacks_is_always_next() {
    let mut have: HashSet<BuildingKind> = HashSet::default();
    for expect in [
        BuildingKind::School,
        BuildingKind::Library,
        BuildingKind::Observatory,
        BuildingKind::University,
    ] {
        assert_eq!(research_target(Era::Renaissance, 45, 350, &have), Some(expect));
        have.insert(expect);
    }
    assert_eq!(research_target(Era::Renaissance, 45, 350, &have), None);
    assert_eq!(research_target(Era::Iron, 45, 350, &HashSet::default()), None);
}

#[test]
fn construction_stalls_without_active_workers_then_completes_with_labor() {
    let mut sim = Simulation::new(0x1AB0);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("worker", "Worker", "lineage-a", 50.0, 50.0);
    worker.age = 10_000;
    worker.specialty = Some("builder".into());
    sim.organisms.push(worker);
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));

    tick_building_progress(&mut sim);
    assert_eq!(sim.buildings[0].condition, 0.0);
    assert!(sim.buildings[0].occupants.is_empty());

    sim.organisms[0].x = 10.0;
    sim.organisms[0].y = 10.0;
    let starting_energy = sim.organisms[0].energy;
    for tick in 1..=10 {
        sim.tick_count = tick * 20;
        tick_building_progress(&mut sim);
        if sim.buildings[0].is_complete() {
            break;
        }
    }
    assert!(sim.buildings[0].is_complete());
    assert_eq!(sim.buildings[0].built_at_tick, sim.tick_count);
    assert!(sim.buildings[0].occupants.is_empty());
    assert!(sim.organisms[0].energy < starting_energy);
    assert!(sim
        .events
        .iter()
        .any(|event| event.etype == "built" && event.detail.contains("hut")));
}

#[test]
fn completed_housing_is_shelter_and_unfinished_projects_are_not() {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x005E_17E2);
    sim.organisms.clear();
    sim.buildings.clear();
    let resident = test_org("resident", "Resident", "lineage-a", 80.0, 80.0);
    sim.organisms.push(resident);
    for y in 75..=85 {
        for x in 75..=85 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(x, y)] = 0.0;
        }
    }

    let mut hut = Building::new(1, BuildingKind::Hut, 81, 80, Some("lineage-a".into()), 0);
    hut.condition = 0.99;
    sim.buildings.push(hut);

    assert!(!sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
    assert!(sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

    sim.buildings[0].condition = 1.0;
    assert!(sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
    assert!(!sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-shelter-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
    let loaded_resident = loaded
        .organisms
        .iter()
        .find(|org| org.id == "resident")
        .expect("resident survives save/load");
    assert!(loaded_resident.near_shelter(&loaded.grid, &loaded.buildings));

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn bridge_requires_a_crossing_and_only_changes_terrain_on_completion() {
    use crate::world::grid::{TrailKind, WorldGrid};
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x00B2_1D6E);
    sim.organisms.clear();
    sim.buildings.clear();
    let (x, y) = (120, 120);
    for tile_y in y - 2..=y + 4 {
        for tile_x in x - 2..=x + 8 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(tile_x, tile_y)] = 0.0;
        }
    }
    sim.grid.set(x + 1, y, Tile::Water);
    sim.grid.set(x + 2, y, Tile::Water);
    sim.grid.depth[WorldGrid::idx(x + 1, y)] = 0.8;
    sim.grid.depth[WorldGrid::idx(x + 2, y)] = 0.7;

    let mut builder = test_org("bridge-builder", "Builder", "lineage-a", x as f32, y as f32);
    builder.age = 10_000;
    builder.energy = 1.0;
    let cost = BuildingKind::Bridge.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);

    assert!(construction_site_is_valid(&sim, BuildingKind::Bridge, x, y));
    assert!(!construction_site_is_valid(&sim, BuildingKind::Bridge, x, y + 2));
    assert!(!construction_site_is_valid(&sim, BuildingKind::Hut, x + 1, y));
    assert!(try_start_building_at(
        &mut sim,
        "lineage-a",
        BuildingKind::Bridge,
        x,
        y
    ));
    assert_eq!(sim.grid.get(x + 1, y), Tile::Water);
    assert_eq!(sim.grid.trail_at(x + 1, y, TrailKind::Path), 0.0);

    sim.buildings[0].condition = 0.99;
    sim.tick_count = 20;
    tick_building_progress(&mut sim);

    assert!(sim.buildings[0].is_operational());
    for tile_x in x..=x + 3 {
        assert_eq!(sim.grid.trail_at(tile_x, y, TrailKind::Path), 5.0);
    }
    for tile_x in x + 1..=x + 2 {
        assert_eq!(sim.grid.get(tile_x, y), Tile::Sand);
        assert_eq!(sim.grid.depth_at(tile_x, y), 0.0);
        assert!(sim.grid.get(tile_x, y).walkable());
    }

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-bridge-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
    assert!(loaded
        .buildings
        .iter()
        .any(|building| building.kind == BuildingKind::Bridge && building.is_operational()));
    assert_eq!(loaded.grid.get(x + 1, y), Tile::Sand);
    assert!(loaded.grid.trail_at(x + 1, y, TrailKind::Path) > 0.0);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn operational_infrastructure_recovers_after_hydrology_changes() {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x1AF2_A57A);
    sim.buildings.clear();
    let (bridge_x, bridge_y) = (140, 140);
    for tile_y in bridge_y - 2..=bridge_y + 6 {
        for tile_x in bridge_x - 2..=bridge_x + 8 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
        }
    }

    let mut bridge = Building::new(
        1,
        BuildingKind::Bridge,
        bridge_x,
        bridge_y,
        Some("lineage-a".into()),
        1,
    );
    bridge.condition = 1.0;
    sim.buildings.push(bridge);
    sim.grid.set(bridge_x + 1, bridge_y, Tile::Water);
    sim.grid.set(bridge_x + 2, bridge_y, Tile::Flooded);
    sim.grid.depth[WorldGrid::idx(bridge_x + 1, bridge_y)] = 0.8;
    sim.grid.depth[WorldGrid::idx(bridge_x + 2, bridge_y)] = 0.6;

    let well_x = bridge_x;
    let well_y = bridge_y + 3;
    let mut well = Building::new(2, BuildingKind::Well, well_x, well_y, Some("lineage-a".into()), 1);
    well.condition = 1.0;
    sim.buildings.push(well);
    sim.grid.set(well_x, well_y, Tile::Grass);
    sim.grid.depth[WorldGrid::idx(well_x, well_y)] = 0.9;

    let unfinished_x = well_x + 3;
    let mut unfinished_well = Building::new(
        3,
        BuildingKind::Well,
        unfinished_x,
        well_y,
        Some("lineage-a".into()),
        1,
    );
    unfinished_well.condition = 0.99;
    sim.buildings.push(unfinished_well);
    sim.grid.set(unfinished_x, well_y, Tile::Grass);

    reconcile_operational_infrastructure(&mut sim);

    for tile_x in bridge_x..bridge_x + 4 {
        assert!(sim.grid.get(tile_x, bridge_y).walkable());
        assert_eq!(sim.grid.depth_at(tile_x, bridge_y), 0.0);
    }
    assert_eq!(sim.grid.get(well_x, well_y), Tile::Water);
    assert_eq!(sim.grid.depth_at(well_x, well_y), 0.0);
    assert_eq!(sim.grid.get(unfinished_x, well_y), Tile::Grass);
}

#[test]
fn incomplete_buildings_grant_no_aura() {
    let mut sim = Simulation::new(0xA0AA);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut patient = test_org("patient", "Patient", "lineage-a", 10.0, 10.0);
    patient.infection = 0.8;
    patient.health = 0.5;
    sim.organisms.push(patient);
    let mut hospital = Building::new(1, BuildingKind::Hospital, 10, 10, Some("lineage-a".into()), 0);
    hospital.condition = 0.99;
    sim.buildings.push(hospital);

    tick_building_auras(&mut sim);
    assert_eq!(sim.organisms[0].infection, 0.8);
    assert_eq!(sim.organisms[0].health, 0.5);

    sim.buildings[0].condition = 1.0;
    tick_building_auras(&mut sim);
    assert!(sim.organisms[0].infection < 0.8);
    assert!(sim.organisms[0].health > 0.5);

    sim.organisms[0].infection = 0.8;
    sim.organisms[0].health = 0.5;
    sim.buildings[0].decorative = true;
    tick_building_auras(&mut sim);
    assert_eq!(sim.organisms[0].infection, 0.8);
    assert_eq!(sim.organisms[0].health, 0.5);
}

#[test]
fn a_project_no_builder_can_reach_moves_to_where_the_tribe_lives() {
    let mut sim = Simulation::new(0x57A1);
    sim.buildings.clear();
    sim.organisms.clear();
    let mut builder = test_org("builder", "Builder", "lineage-a", 60.0, 60.0);
    builder.age = 10_000;
    sim.organisms.push(builder);
    // A workshop its builders started long ago, far from everyone now.
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Workshop,
        10,
        10,
        Some("lineage-a".into()),
        1,
    ));

    relocate_stalled_projects(&mut sim, "lineage-a");

    let moved = &sim.buildings[0];
    let distance = (moved.x - 60).abs() + (moved.y - 60).abs();
    assert!(
        distance <= CONSTRUCTION_WORKER_REACH as i32,
        "stalled project still {distance} tiles from the tribe"
    );
    assert_eq!(moved.condition, 0.0, "no progress was made, none is lost");
}

/// The site search as it ran before it gathered its buildings once: each ring
/// tile goes through the single-site rules in turn.
fn reference_site(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
    preferred_x: i32,
    preferred_y: i32,
) -> Option<(i32, i32)> {
    let ok = |x: i32, y: i32| {
        construction_site_is_valid(sim, kind, x, y)
            && automatic_site_has_clearance(sim, kind, x, y)
            && construction_site_has_reachable_worker(sim, lineage, x, y)
    };
    if ok(preferred_x, preferred_y) {
        return Some((preferred_x, preferred_y));
    }
    for radius in 1i32..=12 {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                if ok(preferred_x + dx, preferred_y + dy) {
                    return Some((preferred_x + dx, preferred_y + dy));
                }
            }
        }
    }
    None
}

#[test]
fn site_search_picks_the_same_tile_as_the_single_site_rules() {
    let kinds = [
        BuildingKind::House,
        BuildingKind::Hut,
        BuildingKind::Fence,
        BuildingKind::Wall,
        BuildingKind::Bridge,
        BuildingKind::Temple,
        BuildingKind::Manor,
        BuildingKind::Castle,
    ];
    let mut compared = 0;
    let mut found = 0;
    for seed in [42u64, 1337] {
        let mut sim = Simulation::new(seed);
        while sim.tick_count < 1_500 {
            sim.tick();
        }
        let mut lineages: Vec<String> = sim
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| o.lineage_id.clone())
            .collect();
        lineages.sort();
        lineages.dedup();
        // Probe around each tribe's centre and beside standing buildings, where
        // overlap, clearance and the ring edge all decide the answer.
        let mut probes: Vec<(String, i32, i32)> = Vec::new();
        for lid in &lineages {
            let (cx, cy) = lineage_center(&sim, lid);
            if (cx, cy) == (0, 0) {
                continue;
            }
            for dy in (-14..=14).step_by(7) {
                for dx in (-14..=14).step_by(7) {
                    probes.push((lid.clone(), cx + dx, cy + dy));
                }
            }
        }
        for building in sim.buildings.iter().filter(|b| !b.decorative).take(40) {
            if let Some(lid) = lineages.first() {
                probes.push((lid.clone(), building.x + 1, building.y));
                probes.push((lid.clone(), building.x, building.y + 2));
            }
        }
        for (lid, x, y) in &probes {
            for &kind in &kinds {
                let expected = reference_site(&sim, lid, kind, *x, *y);
                assert_eq!(
                    find_construction_site(&sim, lid, kind, *x, *y),
                    expected,
                    "seed {seed} lineage {lid} {kind:?} preferred ({x}, {y})"
                );
                compared += 1;
                found += usize::from(expected.is_some());
            }
        }
    }
    assert!(compared > 1_000, "compared {compared} sites");
    assert!(found > 0 && found < compared, "found {found} of {compared}");
}

#[test]
fn a_rich_town_raises_a_manor_and_a_poor_one_does_not() {
    let mut sim = Simulation::new(0x3A);
    sim.organisms.clear();
    sim.buildings.clear();
    for (lineage, wealth) in [("rich", 12), ("poor", 5)] {
        for i in 0..30 {
            let mut org = test_org(&format!("{lineage}-{i}"), "Person", lineage, 10.0, 10.0);
            org.wealth = wealth;
            org.inv_wood = 10;
            org.inv_stone = 10;
            sim.organisms.push(org);
        }
    }
    assert!(
        wants_manor(&sim, "rich", Era::Medieval, 30),
        "a rich town of thirty wants a manor"
    );
    assert!(
        !wants_manor(&sim, "poor", Era::Medieval, 30),
        "a poor town keeps to cheaper homes"
    );
    assert!(
        !wants_manor(&sim, "rich", Era::Iron, 30),
        "no manors before the Medieval age"
    );
    assert!(
        !wants_manor(&sim, "rich", Era::Medieval, 12),
        "a village of twelve builds no manor"
    );
    // One manor per twenty-four people: a second waits until the town has grown.
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Manor,
        20,
        20,
        Some("rich".into()),
        0,
    ));
    assert!(wants_manor(&sim, "rich", Era::Medieval, 30));
    assert!(!wants_manor(&sim, "rich", Era::Medieval, 24));
}
