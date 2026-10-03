//! Applying actions: revalidation at apply time, resource use and outcomes.
use super::*;

#[test]
fn advanced_craft_revalidates_context_and_reserves_materials_atomically() {
    let mut sim = Simulation::new(17);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Iron);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("smith".to_string());
    sim.organisms[idx].discoveries.insert("ironworking".to_string());
    sim.organisms[idx].inv_stone = 2;
    sim.organisms[idx].wealth = 2;
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    let mut forge = Building::new(100, BuildingKind::Forge, x + 1, y, Some(lineage), sim.tick_count);
    forge.condition = 1.0;
    sim.buildings.push(forge);
    let spatial = SpatialIndex::build(&sim.organisms, 10);

    assert!(try_apply(&mut sim, idx, 1202, x, y, &spatial).is_some());
    assert_eq!(sim.organisms[idx].inv_stone, 1);
    assert_eq!(sim.organisms[idx].wealth, 1);

    sim.organisms[idx].specialty = Some("weaver".to_string());
    assert!(try_apply(&mut sim, idx, 1202, x, y, &spatial).is_none());
    assert_eq!(sim.organisms[idx].inv_stone, 1);
    assert_eq!(sim.organisms[idx].wealth, 1);
}

#[test]
fn successful_experiments_record_recent_research_but_generic_study_does_not() {
    let mut sim = Simulation::new(18);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.tick_count = 777;
    sim.lineage_eras.insert(lineage.clone(), Era::Classical);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].literacy = 0.4;
    sim.organisms[idx].discoveries.insert("mathematics".to_string());
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.grid.set(x + 2, y, Tile::Water);
    let mut lab = Building::new(
        101,
        BuildingKind::ResearchLab,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    lab.condition = 1.0;
    sim.buildings.push(lab);
    let spatial = SpatialIndex::build(&sim.organisms, 10);

    assert!(actions_for(&sim, idx).contains(&67));
    assert!(try_apply(&mut sim, idx, 67, x, y, &spatial).is_some());
    assert_eq!(sim.organisms[idx].last_experiment_tick, 777);

    sim.tick_count = 888;
    assert!(try_apply(&mut sim, idx, 66, x, y, &spatial).is_some());
    assert_eq!(sim.organisms[idx].last_experiment_tick, 777);
}

#[test]
fn experiment_evidence_excludes_documentation_teaching_and_observation() {
    for action in [67, 421, 427, 431, 4157, 4183, 4338, 4361, 4872, 4884] {
        assert!(records_experiment(action), "action {action} is experimental");
    }
    for action in [
        422, 429, 435, 4142, 4187, 4204, 4405, 4415, 4560, 4580, 4860, 4903,
    ] {
        assert!(
            !records_experiment(action),
            "action {action} is observation, documentation, or teaching"
        );
    }
}

#[test]
fn advanced_buildings_revalidate_era_training_knowledge_and_materials() {
    let mut sim = Simulation::new(0xB011D);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage, Era::Classical);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx].inv_wood = 10;
    sim.organisms[idx].inv_stone = 10;
    sim.organisms[idx].discoveries.extend(
        [
            "engineering",
            "irrigation",
            "barter",
            "writing",
            "chronicle",
            "astronomy",
            "mathematics",
        ]
        .into_iter()
        .map(str::to_string),
    );
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.organisms[idx].home_x = x as f32;
    sim.organisms[idx].home_y = y as f32;
    sim.organisms[1].lineage_id = sim.organisms[idx].lineage_id.clone();
    sim.organisms[1].x = x as f32 + 1.0;
    sim.organisms[1].y = y as f32;
    sim.grid.set(x, y, Tile::Grass);
    sim.grid.set(x + 1, y, Tile::Rock);
    sim.grid.set(x, y + 1, Tile::Water);

    for (action, specialty) in [
        (167, "engineer"),
        (172, "merchant"),
        (174, "scholar"),
        (175, "scholar"),
    ] {
        sim.organisms[idx].specialty = Some(specialty.to_string());
        assert!(
            actions_for(&sim, idx).contains(&action),
            "qualified specialist should receive action {action}"
        );
        sim.organisms[idx].specialty = None;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(
            try_apply(&mut sim, idx, action, x, y, &spatial).is_none(),
            "action {action} must revalidate profession at apply time"
        );
    }
}

#[test]
fn bridge_action_requires_the_exact_buildable_crossing_it_will_use() {
    let mut sim = Simulation::new(0xB21D_6E51);
    sim.buildings.clear();
    sim.organisms.truncate(1);
    let idx = 0;
    let (x, y) = (120, 120);
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage, Era::Classical);
    let bridge_cost = BuildingKind::Bridge.construction_cost();
    let builder = &mut sim.organisms[idx];
    builder.x = x as f32;
    builder.y = y as f32;
    builder.age = builder.max_age / 2;
    builder.energy = 1.0;
    builder.health = 1.0;
    builder.specialty = Some("engineer".into());
    builder.discoveries.insert("engineering".into());
    builder.discoveries.insert("masonry".into());
    builder.inv_wood = u8::try_from(bridge_cost.wood).expect("bridge wood cost fits inventory");
    builder.inv_stone = u8::try_from(bridge_cost.stone).expect("bridge stone cost fits inventory");
    builder.wealth = bridge_cost.wealth;
    for tile_y in y - 3..=y + 3 {
        for tile_x in x - 3..=x + 7 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
        }
    }

    // Nearby water alone is insufficient: the action creates its project
    // at the actor's exact tile and the bridge footprint extends east.
    sim.grid.set(x, y - 1, Tile::Water);
    assert!(!actions_for(&sim, idx).contains(&41));

    // A dry anchor, water channel, and dry far anchor match the canonical
    // construction validator, so availability and application now agree.
    sim.grid.set(x, y - 1, Tile::Grass);
    sim.grid.set(x + 1, y, Tile::Water);
    sim.grid.set(x + 2, y, Tile::Water);
    assert!(bridge_cost.stone > 0);
    sim.organisms[idx].inv_stone =
        u8::try_from(bridge_cost.stone - 1).expect("bridge stone cost fits inventory");
    assert!(!actions_for(&sim, idx).contains(&41));
    sim.organisms[idx].inv_stone = u8::try_from(bridge_cost.stone).expect("bridge stone cost fits inventory");
    assert!(actions_for(&sim, idx).contains(&41));
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 41, x, y, &spatial).is_some_and(|reward| reward > 0.0));
    assert!(sim
        .buildings
        .iter()
        .any(|building| building.kind == BuildingKind::Bridge && !building.is_complete()));
}

#[test]
fn immediate_infrastructure_commits_its_declared_resource_once() {
    let mut sim = Simulation::new(0xAC71_0042);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage, Era::Iron);
    let builder = &mut sim.organisms[idx];
    builder.age = builder.max_age / 2;
    builder.specialty = Some("builder".into());
    builder.discoveries.insert("road_building".into());
    builder.discoveries.insert("wheel".into());
    builder.inv_stone = 1;
    let (x, y) = (builder.x as i32, builder.y as i32);
    sim.grid.set(x, y, Tile::Grass);

    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 42, x, y, &spatial).is_some_and(|reward| reward > 0.0));
    assert_eq!(sim.organisms[idx].inv_stone, 0);

    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 42, x, y, &spatial).is_none());
    assert_eq!(sim.organisms[idx].inv_stone, 0);
}

#[test]
fn greenhouse_and_siege_require_their_exact_semantic_context_at_apply_time() {
    let mut sim = Simulation::new(0x51E6E);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Medieval);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].inv_wood = 3;
    sim.organisms[idx].inv_stone = 3;
    sim.organisms[idx].specialty = Some("farmer".to_string());
    sim.organisms[idx]
        .discoveries
        .extend(["agriculture", "irrigation"].into_iter().map(str::to_string));
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.grid.set(x, y, Tile::Grass);
    sim.grid.set(x + 1, y, Tile::Rock);

    assert!(actions_for(&sim, idx).contains(&353));
    sim.organisms[idx].discoveries.remove("irrigation");
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 353, x, y, &spatial).is_none());

    sim.organisms[idx].specialty = Some("engineer".to_string());
    sim.organisms[idx]
        .discoveries
        .extend(["engineering", "ironworking"].into_iter().map(str::to_string));
    let mut barracks = Building::new(
        501,
        BuildingKind::Barracks,
        x + 1,
        y + 1,
        Some(lineage),
        sim.tick_count,
    );
    barracks.condition = 1.0;
    sim.buildings.push(barracks);
    assert!(actions_for(&sim, idx).contains(&438));

    sim.buildings[0].decorative = true;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 438, x, y, &spatial).is_none());
}

#[test]
fn base_communication_revalidates_era_knowledge_profession_and_workspace() {
    let mut sim = Simulation::new(19);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx]
        .discoveries
        .extend(["writing".to_string(), "mathematics".to_string()]);
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    let spatial = SpatialIndex::build(&sim.organisms, 10);

    assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_none());
    sim.lineage_eras.insert(lineage.clone(), Era::Classical);
    assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_none());

    let mut library = Building::new(
        101,
        BuildingKind::Library,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    library.condition = 1.0;
    sim.buildings.push(library);
    assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_some());
    assert!(sim.organisms[idx].discoveries.contains("secret_code"));
}

#[test]
fn formal_science_requires_an_operational_research_workspace_at_apply_time() {
    let mut sim = Simulation::new(20);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Renaissance);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx].discoveries.insert("mathematics".to_string());
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    let spatial = SpatialIndex::build(&sim.organisms, 10);

    assert!(!actions_for(&sim, idx).contains(&421));
    let mut lab = Building::new(
        102,
        BuildingKind::ResearchLab,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    lab.condition = 1.0;
    sim.buildings.push(lab);
    assert!(actions_for(&sim, idx).contains(&421));

    sim.buildings[0].decorative = true;
    assert!(try_apply(&mut sim, idx, 421, x, y, &spatial).is_none());
}

#[test]
fn butchery_consumes_one_carried_food_for_each_successful_output() {
    let mut sim = Simulation::new(21);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Medieval);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("hunter".to_string());
    sim.organisms[idx].discoveries.insert("hunting".to_string());
    sim.organisms[idx].inv_food = 1;
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    let mut butcher = Building::new(
        103,
        BuildingKind::Butcher,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    butcher.condition = 1.0;
    sim.buildings.push(butcher);

    let selected_tick = (0..50)
        .find_map(|phase| {
            sim.tick_count = phase * 30;
            actions_for(&sim, idx).contains(&5866).then_some(sim.tick_count)
        })
        .expect("rotating butchery family should eventually include package_roasts");
    sim.tick_count = selected_tick;
    let spatial = SpatialIndex::build(&sim.organisms, 10);

    assert!(try_apply(&mut sim, idx, 5866, x, y, &spatial).is_some());
    assert_eq!(sim.organisms[idx].inv_food, 0);
    assert_eq!(sim.organisms[idx].tools.get("roasts"), Some(&1));

    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx]
        .tools
        .insert("roasts".to_string(), butchery::OUTPUT_CAP);
    assert!(!actions_for(&sim, idx).contains(&5866));
    assert!(eligible_band_for_action(&sim, idx, 5866, x, y, &spatial).is_none());
    assert!(try_apply(&mut sim, idx, 5866, x, y, &spatial).is_none());
    assert_eq!(sim.organisms[idx].inv_food, 1);
    assert_eq!(
        sim.organisms[idx].tools.get("roasts"),
        Some(&butchery::OUTPUT_CAP)
    );
}

#[test]
fn school_and_academy_require_a_hut_and_their_exact_kin_counts() {
    let mut sim = Simulation::new(22);
    let idx = 0;
    assert!(sim.organisms.len() >= 4);
    move_other_organisms_far_away(&mut sim, idx);
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Renaissance);
    sim.organisms[idx].x = 100.0;
    sim.organisms[idx].y = 100.0;
    sim.organisms[idx].age = sim.organisms[idx].max_age.saturating_mul(4) / 5;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx]
        .discoveries
        .extend(["writing".to_string(), "philosophy".to_string()]);
    sim.grid.set(100, 100, Tile::Hut);

    for (neighbor, x) in [(1, 101.0), (2, 102.0)] {
        sim.organisms[neighbor].alive = true;
        sim.organisms[neighbor].lineage_id.clone_from(&lineage);
        sim.organisms[neighbor].x = x;
        sim.organisms[neighbor].y = 100.0;
    }
    let two_kin = actions_for(&sim, idx);
    assert!(two_kin.contains(&501));
    assert!(!two_kin.contains(&510));

    sim.organisms[3].alive = true;
    sim.organisms[3].lineage_id.clone_from(&lineage);
    sim.organisms[3].x = 103.0;
    sim.organisms[3].y = 100.0;
    let three_kin = actions_for(&sim, idx);
    assert!(three_kin.contains(&501));
    assert!(three_kin.contains(&510));

    sim.grid.set(100, 100, Tile::Grass);
    let no_hut = actions_for(&sim, idx);
    assert!(!no_hut.contains(&501));
    assert!(!no_hut.contains(&510));
}

#[test]
fn interfaith_needs_both_groups_and_teach_language_needs_a_stranger() {
    let mut sim = Simulation::new(23);
    let idx = 0;
    assert!(sim.organisms.len() >= 3);
    move_other_organisms_far_away(&mut sim, idx);
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Classical);
    sim.organisms[idx].x = 100.0;
    sim.organisms[idx].y = 100.0;
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("priest".to_string());
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx].discoveries.insert("ritual".to_string());

    sim.organisms[1].alive = true;
    sim.organisms[1].lineage_id.clone_from(&lineage);
    sim.organisms[1].x = 101.0;
    sim.organisms[1].y = 100.0;
    sim.organisms[2].alive = true;
    sim.organisms[2].lineage_id = "visiting-lineage".to_string();
    sim.organisms[2].x = 102.0;
    sim.organisms[2].y = 100.0;

    let mut temple = Building::new(
        104,
        BuildingKind::Temple,
        99,
        100,
        Some(lineage.clone()),
        sim.tick_count,
    );
    temple.condition = 1.0;
    let mut school = Building::new(105, BuildingKind::School, 100, 101, Some(lineage), sim.tick_count);
    school.condition = 1.0;
    sim.buildings.extend([temple, school]);

    assert!(actions_for(&sim, idx).contains(&470));
    sim.organisms[1].x = 300.0;
    sim.organisms[1].y = 300.0;
    assert!(!actions_for(&sim, idx).contains(&470));

    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].discoveries.insert("language".to_string());
    assert!(actions_for(&sim, idx).contains(&520));
    sim.organisms[2].x = 310.0;
    sim.organisms[2].y = 310.0;
    assert!(!actions_for(&sim, idx).contains(&520));
}

#[test]
fn religion_actions_filter_and_revalidate_canonical_membership_requirements() {
    let mut sim = Simulation::new(24);
    let idx = 0;
    assert!(sim.organisms.len() >= 3);
    move_other_organisms_far_away(&mut sim, idx);
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Stone);
    sim.organisms[idx].alive = true;
    sim.organisms[idx].x = 100.0;
    sim.organisms[idx].y = 100.0;
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].is_elder = true;
    sim.organisms[idx].specialty = Some("priest".to_string());
    sim.organisms[idx].discoveries.insert("ritual".to_string());
    for (neighbor, x) in [(1, 101.0), (2, 102.0)] {
        sim.organisms[neighbor].alive = true;
        sim.organisms[neighbor].lineage_id.clone_from(&lineage);
        sim.organisms[neighbor].x = x;
        sim.organisms[neighbor].y = 100.0;
    }

    assert!(actions_for(&sim, idx).contains(&456));
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_some());
    assert_eq!(sim.religions.len(), 1);

    assert!(!actions_for(&sim, idx).contains(&456));
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_none());

    sim.organisms[3].alive = true;
    sim.organisms[3].lineage_id = "foreign-faith-lineage".to_string();
    sim.organisms[3].x = 103.0;
    sim.organisms[3].y = 100.0;
    let mut temple = Building::new(
        999,
        BuildingKind::Temple,
        100,
        100,
        Some(lineage.clone()),
        sim.tick_count,
    );
    temple.condition = 1.0;
    sim.buildings.push(temple);
    assert!(actions_for(&sim, idx).contains(&458));

    sim.organisms[idx].religion_id = Some("dangling-religion".to_string());
    assert!(!actions_for(&sim, idx).contains(&458));
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 458, 100, 100, &spatial).is_none());

    sim.religions.clear();
    sim.organisms[idx].is_elder = false;
    assert!(!actions_for(&sim, idx).contains(&456));
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_none());
}

#[test]
fn established_route_dispatches_tool_cargo_without_a_foreign_visitor() {
    let mut sim = Simulation::new(25);
    sim.organisms.truncate(2);
    for (index, organism) in sim.organisms.iter_mut().enumerate() {
        organism.alive = true;
        organism.lineage_id = if index == 0 { "river" } else { "hill" }.into();
        organism.x = if index == 0 { 100.0 } else { 220.0 };
        organism.y = if index == 0 { 100.0 } else { 160.0 };
        organism.home_x = organism.x;
        organism.home_y = organism.y;
        organism.age = organism.max_age / 2;
        organism.inv_food = 0;
        organism.inv_water = 0;
        organism.inv_wood = 0;
        organism.inv_stone = 0;
        organism.tools.clear();
    }
    sim.organisms[0].specialty = Some("merchant".into());
    sim.organisms[0].discoveries.insert("currency".into());
    sim.organisms[0].tools.insert("cloth".into(), 2);
    sim.lineage_eras.insert("river".into(), Era::Iron);
    sim.lineage_eras.insert("hill".into(), Era::Iron);

    let mut market = Building::new(
        1,
        BuildingKind::MarketStall,
        100,
        100,
        Some("river".into()),
        sim.tick_count,
    );
    market.condition = 1.0;
    let mut river_hut = Building::new(
        2,
        BuildingKind::Hut,
        101,
        100,
        Some("river".into()),
        sim.tick_count,
    );
    river_hut.condition = 1.0;
    let mut hill_hut = Building::new(
        3,
        BuildingKind::Hut,
        220,
        160,
        Some("hill".into()),
        sim.tick_count,
    );
    hill_hut.condition = 1.0;
    sim.buildings.extend([market, river_hut, hill_hut]);

    assert!(crate::sim::civ::trade_routes::establish_route(&mut sim, 0, 1));
    assert!(actions_for(&sim, 0).contains(&288));

    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let reward = try_apply(&mut sim, 0, 288, 100, 100, &spatial);
    assert!(reward.is_some_and(|reward| reward > 0.0));
    assert_eq!(sim.organisms[0].tools.get("cloth"), None);
    assert_eq!(sim.caravans.len(), 1);
    assert_eq!(sim.caravans[0].cargo, "cloth");
    assert_eq!(sim.caravans[0].amount, 2);
}
