//! Lineage strategy objectives, wellbeing snapshots and guidance repair.

use super::*;

#[test]
fn lineage_wellbeing_snapshot_excludes_dead_members_and_refreshes_next_tick() {
    let mut sim = Simulation::new(0xBEE1);
    let lineage = sim.organisms[0].lineage_id.clone();
    for org in &mut sim.organisms {
        org.alive = false;
    }
    for (idx, energy) in [(0, 0.25), (1, 0.75), (2, 0.95)] {
        let org = &mut sim.organisms[idx];
        org.lineage_id = lineage.clone();
        org.energy = energy;
        org.alive = idx != 2;
    }

    sim.rebuild_lineage_aggregates();
    let snapshot = sim.lineage_aggregates[&lineage];
    assert_eq!(snapshot.population, 2);
    assert!((snapshot.energy_sum - 1.0).abs() < f32::EPSILON);

    sim.organisms[0].energy = 0.5;
    assert_eq!(sim.lineage_aggregates[&lineage].energy_sum, 1.0);
    sim.rebuild_lineage_aggregates();
    assert!((sim.lineage_aggregates[&lineage].energy_sum - 1.25).abs() < f32::EPSILON);
}

#[test]
fn completing_a_strategy_objective_rewards_the_lineage_once() {
    let mut sim = Simulation::new(0x057A_7E6E);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_names
        .insert(lineage_id.clone(), "Wayfinders".to_string());
    sim.start_strategy_objective(&lineage_id, "trade", 200);
    let objective = sim.lineage_strategy_objectives.get_mut(&lineage_id).unwrap();
    objective.target = 2;

    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.wealth = 0;
        organism.hope = 0.0;
        organism.joy_ticks = 0;
    }

    sim.record_strategy_progress(&lineage_id, "trade");
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].progress, 1);
    sim.record_strategy_progress(&lineage_id, "trade");

    let completed_tick = sim.lineage_strategy_objectives[&lineage_id].completed_tick;
    assert_eq!(completed_tick, Some(100));
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].failed_tick, None);
    assert_eq!(sim.lineage_strategy_history.len(), 1);
    let campaign = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.lineage_id, lineage_id);
    assert_eq!(campaign.lineage_name, "Wayfinders");
    assert_eq!(campaign.strategy, "trade");
    assert_eq!(campaign.outcome, "completed");
    assert_eq!(campaign.reason, None);
    assert_eq!(campaign.progress, 2);
    assert_eq!(campaign.target, 2);
    for organism in sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        assert_eq!(organism.wealth, 3);
        assert!((organism.hope - 0.10).abs() < f32::EPSILON);
        assert_eq!(organism.joy_ticks, 180);
        assert!(organism.attributes.contains("campaign:trade"));
    }
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_complete")
            .count(),
        1
    );

    sim.record_strategy_progress(&lineage_id, "trade");
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_complete")
            .count(),
        1
    );
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| organism.wealth == 3));
}

#[test]
fn replaying_a_completed_strategy_does_not_create_another_reward() {
    let mut sim = Simulation::new(0x000D_0B1E);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.start_strategy_objective(&lineage_id, "trade", 200);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.wealth = 0;
    }
    sim.record_strategy_progress(&lineage_id, "trade");
    assert!(sim.lineage_strategy_objectives[&lineage_id]
        .completed_tick
        .is_some());
    assert_eq!(sim.lineage_strategy_history.len(), 1);

    sim.start_strategy_objective(&lineage_id, "trade", 300);
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].target, 1);
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].expires_tick, 300);
    sim.record_strategy_progress(&lineage_id, "trade");

    assert_eq!(sim.lineage_strategy_history.len(), 1);
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| organism.wealth == 3));
}

#[test]
fn expired_strategy_objective_records_failure_and_penalty_once() {
    let mut sim = Simulation::new(0x00FA_11ED);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_names
        .insert(lineage_id.clone(), "Long Walk".to_string());
    sim.start_strategy_objective(&lineage_id, "explore", 110);
    sim.lineage_strategies
        .insert(lineage_id.clone(), ("explore".to_string(), 110));
    let objective = sim.lineage_strategy_objectives.get_mut(&lineage_id).unwrap();
    objective.progress = 7;
    objective.target = 10;
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.hope = 0.50;
        organism.boredom = 0.10;
    }

    sim.tick_count = 110;
    sim.resolve_strategy_objective_expirations();

    let objective = &sim.lineage_strategy_objectives[&lineage_id];
    assert_eq!(objective.completed_tick, None);
    assert_eq!(objective.failed_tick, Some(110));
    assert_eq!(sim.lineage_strategy_history.len(), 1);
    let campaign = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.outcome, "expired");
    assert_eq!(campaign.lineage_name, "Long Walk");
    assert_eq!(campaign.reason.as_deref(), Some("deadline"));
    assert_eq!(campaign.progress, 7);
    assert_eq!(campaign.target, 10);
    assert!(!sim.lineage_strategies.contains_key(&lineage_id));
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_failed")
            .count(),
        1
    );
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| {
            (organism.hope - 0.46).abs() < f32::EPSILON && (organism.boredom - 0.13).abs() < f32::EPSILON
        }));

    sim.resolve_strategy_objective_expirations();
    assert_eq!(sim.lineage_strategy_history.len(), 1);
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_failed")
            .count(),
        1
    );
}

#[test]
fn extinct_lineage_archives_an_active_campaign_with_its_name() {
    let mut sim = Simulation::new(0x00E7_71C7);
    sim.tick_count = 200;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_names
        .insert(lineage_id.clone(), "Last Ember".to_string());
    sim.start_strategy_objective(&lineage_id, "defend", 800);
    sim.lineage_strategies
        .insert(lineage_id.clone(), ("defend".to_string(), 800));
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.lineage_id == lineage_id)
    {
        organism.alive = false;
        organism.pregnant = false;
    }

    sim.resolve_extinct_strategy_objectives();

    assert!(!sim.lineage_strategy_objectives.contains_key(&lineage_id));
    assert!(!sim.lineage_strategies.contains_key(&lineage_id));
    let campaign = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.lineage_id, lineage_id);
    assert_eq!(campaign.lineage_name, "Last Ember");
    assert_eq!(campaign.outcome, "failed");
    assert_eq!(campaign.reason.as_deref(), Some("lineage_extinct"));
}

#[test]
fn loading_legacy_guidance_creates_a_playable_objective() {
    let mut sim = Simulation::new(0x001E_6AC7);
    sim.tick_count = 400;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_strategies
        .insert(lineage_id.clone(), ("settle".to_string(), 1_000));
    sim.lineage_strategy_objectives.clear();

    let loaded = Simulation::from_save(0x001E_6AC7, sim.to_save_state());

    let objective = loaded.lineage_strategy_objectives.get(&lineage_id).unwrap();
    assert_eq!(objective.strategy, "settle");
    assert_eq!(objective.started_tick, 400);
    assert_eq!(objective.expires_tick, 1_000);
    assert_eq!(objective.progress, 0);
    assert_eq!(objective.target, 300);
    assert_eq!(objective.completed_tick, None);
    assert_eq!(objective.failed_tick, None);
}

#[test]
fn loading_repairs_zero_target_or_mismatched_guidance_objectives() {
    let mut sim = Simulation::new(0xBAD_0B1);
    sim.tick_count = 400;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_strategies
        .insert(lineage_id.clone(), ("trade".to_string(), 1_000));
    sim.lineage_strategy_objectives.insert(
        lineage_id.clone(),
        StrategyObjective {
            strategy: "hunt".to_string(),
            started_tick: 100,
            expires_tick: 800,
            progress: 50,
            target: 0,
            completed_tick: None,
            failed_tick: None,
        },
    );

    let loaded = Simulation::from_save(0xBAD_0B1, sim.to_save_state());

    let objective = loaded.lineage_strategy_objectives.get(&lineage_id).unwrap();
    assert_eq!(objective.strategy, "trade");
    assert_eq!(objective.started_tick, 400);
    assert_eq!(objective.expires_tick, 1_000);
    assert_eq!(objective.progress, 0);
    assert_eq!(objective.target, 300);
    assert_eq!(objective.completed_tick, None);
    assert_eq!(objective.failed_tick, None);
}

#[test]
fn scarcity_migration_uses_configured_season_names() {
    assert!(scarcity_driven_migration_season("scarcity"));
    assert!(scarcity_driven_migration_season("decline"));
    assert!(!scarcity_driven_migration_season("winter"));
    assert!(!scarcity_driven_migration_season("dry"));
}

#[test]
fn emergency_shelter_reflex_does_not_reopen_an_existing_project() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(0xE911);
    let idx = sim.organisms.iter().position(|organism| organism.alive).unwrap();
    sim.buildings.clear();
    sim.weather.kind = 2;
    sim.organisms[idx].inv_wood = 1;
    let lineage = sim.organisms[idx].lineage_id.clone();
    let (x, y) = (90, 90);
    sim.organisms[idx].x = x as f32;
    sim.organisms[idx].y = y as f32;
    for tile_y in y - 4..=y + 4 {
        for tile_x in x - 4..=x + 4 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(tile_x, tile_y)] = 0.0;
        }
    }

    assert!(sim.should_start_emergency_shelter(idx));

    let mut hut = Building::new(1, BuildingKind::Hut, x, y, Some(lineage), sim.tick_count);
    hut.condition = 0.5;
    sim.buildings.push(hut);
    assert!(sim.organisms[idx].has_shelter_project_within(&sim.buildings, 3));
    assert!(!sim.organisms[idx].near_shelter(&sim.grid, &sim.buildings));
    assert!(!sim.should_start_emergency_shelter(idx));

    sim.buildings[0].condition = 1.0;
    assert!(sim.organisms[idx].near_shelter(&sim.grid, &sim.buildings));
    assert!(!sim.should_start_emergency_shelter(idx));
}

#[test]
fn fortify_position_consumes_material_and_records_lineage_ownership() {
    let mut sim = Simulation::new(0xF047);
    let idx = sim.organisms.iter().position(|organism| organism.alive).unwrap();
    let lineage_id = sim.organisms[idx].lineage_id.clone();
    sim.organisms[idx].inv_wood = 1;
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    let spatial = crate::sim::spatial::SpatialIndex::build(&sim.organisms, 10);

    let result = crate::sim::actions::try_apply(&mut sim, idx, 192, x, y, &spatial);

    assert!(result.is_some_and(|reward| reward > 0.0));
    assert_eq!(sim.organisms[idx].inv_wood, 0);
    assert!(sim.field_fortifications.iter().any(|fortification| {
        fortification.x == x && fortification.y == y && fortification.lineage_id == lineage_id
    }));
}
