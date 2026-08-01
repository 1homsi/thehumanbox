use super::*;

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

#[test]
fn lineage_era_does_not_regress_when_population_dips() {
    use crate::organism::organism::Organism;
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xaea);
    sim.organisms.clear();
    let mut survivor = Organism::new(
        "survivor".to_string(),
        "Survivor".to_string(),
        50.0,
        50.0,
        0,
        String::new(),
        "lineage-a".to_string(),
        20_000,
        crate::organism::traits::Traits::default(),
    );
    survivor.alive = true;
    survivor.discoveries.insert("fire".to_string());
    survivor.discoveries.insert("stone_tools".to_string());
    survivor.discoveries.insert("shelter".to_string());
    sim.organisms.push(survivor);
    sim.lineage_eras.insert("lineage-a".to_string(), Era::Classical);
    sim.current_era = "classical".to_string();

    sim.update_lineage_eras();

    assert_eq!(sim.lineage_eras.get("lineage-a"), Some(&Era::Classical));
    assert_eq!(sim.current_era, "classical");
}

fn prepare_atomic_population_gate_world(
    sim: &mut Simulation,
    desired_world_population: usize,
) -> (String, usize) {
    use crate::sim::era::Era;

    let lineage_id = sim
        .organisms
        .iter()
        .find(|org| org.alive)
        .expect("founder exists")
        .lineage_id
        .clone();
    let lineage_population = sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage_id)
        .count();
    assert!(lineage_population < Era::Atomic.pop_threshold());
    assert!(lineage_population <= desired_world_population);

    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage_id)
    {
        for discovery in Era::Atomic.required_discoveries() {
            org.discoveries.insert((*discovery).to_string());
        }
    }

    let mut living = lineage_population;
    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id != lineage_id)
    {
        if living < desired_world_population {
            living += 1;
        } else {
            org.alive = false;
        }
    }
    assert_eq!(living, desired_world_population);

    sim.lineage_eras.clear();
    sim.lineage_eras.insert(lineage_id.clone(), Era::Information);
    sim.current_era = Era::Information.name().to_string();
    (lineage_id, lineage_population)
}

#[test]
fn small_lineage_advances_when_living_world_meets_population_gate() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xa70a);
    let atomic_gate = Era::Atomic.pop_threshold();
    let (lineage_id, lineage_population) = prepare_atomic_population_gate_world(&mut sim, atomic_gate);

    sim.update_lineage_eras();

    assert!(lineage_population < atomic_gate);
    assert_eq!(sim.lineage_eras.get(&lineage_id), Some(&Era::Atomic));
    assert_eq!(sim.current_era, Era::Atomic.name());
    assert!(sim
        .lineage_eras
        .iter()
        .filter(|(other_id, _)| *other_id != &lineage_id)
        .all(|(_, era)| *era < Era::Atomic));
}

#[test]
fn small_lineage_cannot_advance_before_living_world_meets_population_gate() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xa709);
    let below_atomic_gate = Era::Atomic.pop_threshold() - 1;
    let (lineage_id, _) = prepare_atomic_population_gate_world(&mut sim, below_atomic_gate);

    sim.update_lineage_eras();

    assert_eq!(
        sim.organisms.iter().filter(|org| org.alive).count(),
        below_atomic_gate
    );
    assert_eq!(sim.lineage_eras.get(&lineage_id), Some(&Era::Information));
    assert_eq!(sim.current_era, Era::Information.name());
}

fn prepare_technological_era_boundary(sim: &mut Simulation, era: crate::sim::era::Era) {
    let alive_lineages: std::collections::HashSet<String> = sim
        .organisms
        .iter()
        .filter(|org| org.alive)
        .map(|org| org.lineage_id.clone())
        .collect();

    sim.tick_count = 1199;
    sim.current_era = era.name().to_string();
    sim.lineage_eras.clear();
    for lineage_id in alive_lineages {
        sim.lineage_eras.insert(lineage_id, era);
    }
    sim.events.clear();
    sim.headlines.clear();
    sim.history.era_history.clear();
}

const ECOLOGICAL_CONDITION_LABELS: [&str; 10] = [
    "extinction",
    "collapse",
    "drought",
    "abundance",
    "growth",
    "expansion",
    "decline",
    "equilibrium",
    "scarcity",
    "recovery",
];

fn is_ecological_condition(label: &str) -> bool {
    ECOLOGICAL_CONDITION_LABELS.contains(&label)
}

fn announces_ecological_era(text: &str) -> bool {
    let text = text.to_ascii_lowercase();
    ECOLOGICAL_CONDITION_LABELS
        .iter()
        .any(|label| text.contains(&format!("the {label} era begins")))
}

#[test]
fn twelve_hundred_tick_boundary_keeps_current_era_technological() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xe12a);
    prepare_technological_era_boundary(&mut sim, Era::Classical);

    sim.tick();

    assert_eq!(sim.tick_count, 1200);
    assert_eq!(sim.current_era, "classical");
    assert!(sim.history.era_history.is_empty());
    assert!(!sim.events.iter().any(|event| event.etype == "era"));
    assert!(!sim
        .headlines
        .iter()
        .any(|(_, headline)| announces_ecological_era(headline)));
}

#[test]
fn twelve_hundred_tick_boundary_emits_only_real_technological_era_advances() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0x7ec4);
    for org in sim.organisms.iter_mut().filter(|org| org.alive) {
        org.discoveries.insert("fire".to_string());
        org.discoveries.insert("stone_tools".to_string());
        org.discoveries.insert("shelter".to_string());
    }
    prepare_technological_era_boundary(&mut sim, Era::PreStone);

    sim.tick();

    assert_eq!(sim.current_era, "stone");
    assert_eq!(
        sim.history
            .era_history
            .iter()
            .map(|entry| entry.era.as_str())
            .collect::<Vec<_>>(),
        vec!["stone"]
    );
    assert!(!sim
        .history
        .era_history
        .iter()
        .any(|entry| is_ecological_condition(&entry.era)));
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "era")
            .map(|event| event.detail.as_str())
            .collect::<Vec<_>>(),
        vec!["the stone era begins"]
    );
    assert!(!sim
        .headlines
        .iter()
        .any(|(_, headline)| announces_ecological_era(headline)));
}

fn autonomy_test_organism(id: &str, x: f32, y: f32) -> Organism {
    let mut org = Organism::new(
        id.to_string(),
        "Autonomous".to_string(),
        x,
        y,
        0,
        String::new(),
        "lineage-a".to_string(),
        20_000,
        crate::organism::traits::Traits::default(),
    );
    org.alive = true;
    org.age = 1500;
    org.energy = 0.60;
    org.hydration = 0.60;
    org.health = 0.90;
    org.sleep_debt = 0.0;
    org.fear_level = 0.0;
    org.traits.fear = 0.10;
    org.traits.curiosity = 0.10;
    org
}

fn flatten_test_area(sim: &mut Simulation, cx: i32, cy: i32) {
    for x in (cx - 12)..=(cx + 12) {
        for y in (cy - 12)..=(cy + 12) {
            sim.grid.set(x, y, Tile::Sand);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
}

fn learned_perception_for_first_org(sim: &Simulation, animal_near: bool) -> String {
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    sim.organisms[0].perceive(&sim.grid, &sim.organisms, false, animal_near, &spatial)
}

fn tick_first_org(sim: &mut Simulation) {
    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lineage-a".to_string(), 1);
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let mut spatial_buf = Vec::new();
    let org_idx_by_id: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    sim.tick_organism(0, 1, &lineage_counts, &spatial, &mut spatial_buf, &org_idx_by_id);
}

#[test]
fn nearby_prey_does_not_override_learned_action_choice() {
    let mut sim = Simulation::new(0xa701);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    let mut org = autonomy_test_organism("learner", 50.0, 50.0);
    org.energy = 0.50;
    sim.organisms.push(org);
    sim.animals.push(Animal::new(1, 54.0, 50.0, AnimalKind::Deer));
    sim.tick_count = 5_000;

    let perception = learned_perception_for_first_org(&sim, true);
    sim.organisms[0]
        .q_table
        .insert(perception, vec![(24, 5.0), (3, 0.1)]);

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "scouting the area");
    assert_ne!(sim.organisms[0].thought, "stalking prey");
}

#[test]
fn distant_wolf_pressure_updates_memory_without_forcing_action() {
    let mut sim = Simulation::new(0xa702);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.push(autonomy_test_organism("learner", 50.0, 50.0));
    sim.animals.push(Animal::new(1, 54.0, 50.0, AnimalKind::Wolf));
    sim.tick_count = 5_000;

    let perception = learned_perception_for_first_org(&sim, true);
    sim.organisms[0]
        .q_table
        .insert(perception, vec![(24, 5.0), (3, 0.1)]);

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "scouting the area");
    assert!(sim.organisms[0].danger_memory.contains_key(&(54, 50)));
    assert!(sim.organisms[0].fear_level > 0.0);
    assert_ne!(sim.organisms[0].thought, "wolf! run!");
}

#[test]
fn adjacent_wolf_still_triggers_emergency_reflex() {
    let mut sim = Simulation::new(0xa703);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.push(autonomy_test_organism("learner", 50.0, 50.0));
    sim.animals.push(Animal::new(1, 51.0, 51.0, AnimalKind::Wolf));
    sim.tick_count = 5_000;

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "wolf! run!");
    assert!(sim.organisms[0].wander_target.is_some());
    assert!(sim.organisms[0].danger_memory.contains_key(&(51, 51)));
}

#[test]
fn fallback_walkable_step_detours_around_blocked_direction() {
    let mut grid = WorldGrid::new(101);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);

    let step = fallback_walkable_step(&grid, 10, 10, 3, 0.5, 1.0);

    assert!(matches!(step, Some((11, 9)) | Some((11, 11))));
}

#[test]
fn fallback_walkable_step_prefers_safer_aligned_detour() {
    let mut grid = WorldGrid::new(102);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);
    grid.hazard[WorldGrid::idx(11, 9)] = 0.95;

    let step = fallback_walkable_step(&grid, 10, 10, 3, 0.9, 0.4);

    assert_eq!(step, Some((11, 11)));
}

#[test]
fn safe_flee_target_avoids_hazardous_raw_anchor() {
    let mut grid = WorldGrid::new(120);
    for x in 45..=85 {
        for y in 45..=65 {
            grid.set(x, y, Tile::Grass);
            grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    grid.hazard[WorldGrid::idx(70, 50)] = 0.95;

    let target = safe_flee_target(&grid, 50.0, 50.0, 1.0, 0.0, 20.0);

    assert_ne!(target, (70, 50));
    assert_eq!(grid.get(target.0, target.1), Tile::Grass);
    assert!(grid.hazard_at(target.0, target.1) < 0.40);
}

#[test]
fn safe_flee_target_avoids_unwalkable_raw_anchor() {
    let mut grid = WorldGrid::new(121);
    for x in 45..=85 {
        for y in 45..=65 {
            grid.set(x, y, Tile::Grass);
            grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    grid.set(70, 50, Tile::Rock);

    let target = safe_flee_target(&grid, 50.0, 50.0, 1.0, 0.0, 20.0);

    assert_ne!(target, (70, 50));
    assert!(grid.get(target.0, target.1).walkable());
}

#[test]
fn movement_feedback_penalizes_blocked_detour() {
    let mut grid = WorldGrid::new(105);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);

    let feedback = movement_step_feedback(&grid, 10, 10, 3, Some((11, 11)));

    assert!(feedback < 0.0);
}

#[test]
fn movement_feedback_penalizes_hazardous_destination_more_than_safe_step() {
    let mut grid = WorldGrid::new(106);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.hazard[WorldGrid::idx(11, 10)] = 0.9;

    let hazardous = movement_step_feedback(&grid, 10, 10, 3, Some((11, 10)));
    let safe = movement_step_feedback(&grid, 10, 10, 5, Some((11, 9)));

    assert!(hazardous < safe);
    assert!(hazardous < 0.0);
    assert!(safe > 0.0);
}

#[test]
fn movement_momentum_feedback_penalizes_backtracking_loop() {
    let mut sim = Simulation::new(113);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.80;
    sim.organisms[idx].hydration = 0.80;
    sim.organisms[idx].health = 0.90;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].vx_smooth = 1.0;
    sim.organisms[idx].vy_smooth = 0.0;

    let feedback = movement_momentum_feedback(&sim.organisms[idx], &sim.grid, (10, 10), Some((9, 10)));

    assert!(feedback < 0.0);
}

#[test]
fn movement_momentum_feedback_allows_danger_escape_backtrack() {
    let mut sim = Simulation::new(114);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.80;
    sim.organisms[idx].hydration = 0.80;
    sim.organisms[idx].health = 0.90;
    sim.organisms[idx].vx_smooth = 1.0;
    sim.organisms[idx].vy_smooth = 0.0;
    sim.grid.hazard[WorldGrid::idx(10, 10)] = 0.80;
    sim.grid.hazard[WorldGrid::idx(9, 10)] = 0.05;

    let feedback = movement_momentum_feedback(&sim.organisms[idx], &sim.grid, (10, 10), Some((9, 10)));

    assert_eq!(feedback, 0.0);
}

#[test]
fn resource_progress_feedback_rewards_moving_toward_remembered_food() {
    let mut sim = Simulation::new(107);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.25;
    sim.organisms[idx].hydration = 0.90;
    sim.organisms[idx].food_memory.insert((20, 10), 0.9);

    let feedback = urgent_resource_progress_feedback(&sim.organisms[idx], (10, 10), Some((11, 10)));

    assert!(feedback > 0.0);
}

#[test]
fn resource_progress_feedback_penalizes_moving_away_from_remembered_water() {
    let mut sim = Simulation::new(108);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.90;
    sim.organisms[idx].hydration = 0.20;
    sim.organisms[idx].water_memory.insert((20, 10), 0.9);

    let feedback = urgent_resource_progress_feedback(&sim.organisms[idx], (10, 10), Some((9, 10)));

    assert!(feedback < 0.0);
}

#[test]
fn reserve_inventory_feedback_rewards_useful_food_reserve_gain() {
    let mut sim = Simulation::new(115);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 0;

    let feedback = reserve_inventory_feedback(0.45, 0.90, 0, 0, &sim.organisms[idx]);

    assert!(feedback > 0.0);
}

#[test]
fn reserve_inventory_feedback_does_not_reward_food_hoarding_past_small_buffer() {
    let mut sim = Simulation::new(116);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 4;
    sim.organisms[idx].inv_water = 0;

    let feedback = reserve_inventory_feedback(0.45, 0.90, 3, 0, &sim.organisms[idx]);

    assert_eq!(feedback, 0.0);
}

#[test]
fn reserve_inventory_feedback_rewards_water_reserve_when_future_thirsty() {
    let mut sim = Simulation::new(117);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 0;
    sim.organisms[idx].inv_water = 2;

    let feedback = reserve_inventory_feedback(0.90, 0.35, 0, 0, &sim.organisms[idx]);

    assert!(feedback > 0.0);
}

#[test]
fn critical_reserve_use_ignores_periodic_cadence() {
    let mut sim = Simulation::new(118);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.20;
    sim.organisms[idx].hydration = 0.18;
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 1;

    let (used_food, used_water) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(used_food);
    assert!(used_water);
    assert_eq!(sim.organisms[idx].inv_food, 0);
    assert_eq!(sim.organisms[idx].inv_water, 0);
    assert!(sim.organisms[idx].energy > 0.20);
    assert!(sim.organisms[idx].hydration > 0.18);
}

#[test]
fn moderate_reserve_use_keeps_periodic_cadence() {
    let mut sim = Simulation::new(119);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.40;
    sim.organisms[idx].hydration = 0.50;
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 1;

    let (used_food, used_water) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(!used_food);
    assert!(!used_water);
    assert_eq!(sim.organisms[idx].inv_food, 1);
    assert_eq!(sim.organisms[idx].inv_water, 1);
}

#[test]
fn stored_winter_provisions_feed_an_organism_after_carried_food_runs_out() {
    let mut sim = Simulation::new(120);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.20;
    sim.organisms[idx].inv_food = 0;
    sim.organisms[idx].tools.insert("winter_provisions".into(), 2);

    let (used_food, _) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(used_food);
    assert_eq!(sim.organisms[idx].tools.get("winter_provisions"), Some(&1));
    assert!(sim.organisms[idx].energy > 0.20);
}

#[test]
fn local_resource_verification_decays_stale_food_memory_nearby() {
    let mut sim = Simulation::new(109);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.organisms[idx].food_memory.insert((10, 10), 0.9);
    sim.organisms[idx].food_memory.insert((11, 10), 0.8);

    verify_local_resource_memory(&mut sim.organisms[idx], &sim.grid, 10, 10);

    assert!(
        sim.organisms[idx]
            .food_memory
            .get(&(10, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.5
    );
    assert!(
        sim.organisms[idx]
            .food_memory
            .get(&(11, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.8
    );
}

#[test]
fn local_resource_verification_keeps_memory_when_resource_is_nearby() {
    let mut sim = Simulation::new(110);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.grid.set(11, 10, Tile::Food);
    sim.organisms[idx].food_memory.insert((10, 10), 0.9);

    verify_local_resource_memory(&mut sim.organisms[idx], &sim.grid, 10, 10);

    assert_eq!(sim.organisms[idx].food_memory.get(&(10, 10)).copied(), Some(0.9));
}

#[test]
fn local_danger_verification_decays_stale_safe_area_memory() {
    let mut sim = Simulation::new(111);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.organisms[idx].danger_memory.insert((10, 10), 0.9);
    sim.organisms[idx].danger_memory.insert((11, 10), 0.8);

    verify_local_danger_memory(&mut sim.organisms[idx], &sim.grid, &sim.animals, 10, 10);

    assert!(
        sim.organisms[idx]
            .danger_memory
            .get(&(10, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.55
    );
    assert!(
        sim.organisms[idx]
            .danger_memory
            .get(&(11, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.8
    );
}

#[test]
fn local_danger_verification_keeps_memory_when_hazard_remains_nearby() {
    let mut sim = Simulation::new(112);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.grid.hazard[WorldGrid::idx(11, 10)] = 0.70;
    sim.organisms[idx].danger_memory.insert((11, 10), 0.8);

    verify_local_danger_memory(&mut sim.organisms[idx], &sim.grid, &sim.animals, 10, 10);

    assert_eq!(
        sim.organisms[idx].danger_memory.get(&(11, 10)).copied(),
        Some(0.8)
    );
}

#[test]
fn land_target_rejects_hazardous_anchor() {
    let mut sim = Simulation::new(103);
    for x in 45..=55 {
        for y in 45..=55 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.grid.hazard[WorldGrid::idx(50, 50)] = 0.60;

    assert!(!sim.is_good_land_target(50, 50));
    assert!(sim.is_good_land_target(54, 54));
}

#[test]
fn wander_validation_clears_hazardous_existing_target() {
    let mut sim = Simulation::new(104);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.95;
    sim.organisms[idx].hydration = 0.95;
    sim.organisms[idx].age = 2_000;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].wander_target = Some((80, 80));
    sim.grid.set(80, 80, Tile::Grass);
    sim.grid.hazard[WorldGrid::idx(80, 80)] = 0.90;

    sim.validate_or_assign_wander_target(idx);

    assert_ne!(sim.organisms[idx].wander_target, Some((80, 80)));
}

#[test]
fn save_result_writes_schema_version_and_cleans_temp_file() {
    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-save-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let tmp_s = format!("{}.tmp", path_s);
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(&tmp_s);

    let sim = Simulation::new(11);
    sim.save_result(&path_s).unwrap();

    let saved = std::fs::read_to_string(&path_s).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&saved).unwrap();
    assert_eq!(parsed["version"], SAVE_SCHEMA_VERSION);
    assert!(!std::path::Path::new(&tmp_s).exists());

    let _ = std::fs::remove_file(&path_s);
}

#[test]
fn save_load_preserves_social_continuity_and_rng_stream() {
    use rand::RngExt;

    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-continuity-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let tmp_s = format!("{}.tmp", path_s);
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(&tmp_s);

    let mut sim = Simulation::new(17);
    sim.tick_count = 12_345;
    let guided_lineage = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_strategies
        .insert(guided_lineage.clone(), ("settle".to_string(), 13_000));
    sim.lineage_strategy_objectives.insert(
        guided_lineage.clone(),
        StrategyObjective {
            strategy: "settle".to_string(),
            started_tick: 12_000,
            expires_tick: 13_000,
            progress: 27,
            target: 90,
            completed_tick: None,
            failed_tick: None,
        },
    );
    sim.lineage_strategy_history.push_back(StrategyCampaignRecord {
        lineage_id: "lineage-a".to_string(),
        lineage_name: "Lineage A".to_string(),
        strategy: "trade".to_string(),
        started_tick: 11_000,
        ended_tick: 11_800,
        progress: 80,
        target: 80,
        outcome: "completed".to_string(),
        reason: None,
    });
    sim.lineage_last_council.insert("lineage-a".to_string(), 12_000);
    sim.lineage_elders
        .insert("lineage-a".to_string(), "elder-a".to_string());
    sim.lineage_negotiations
        .insert(("lineage-a".to_string(), "lineage-b".to_string()), 11_500);
    sim.pending_thinks.push(ThinkTrigger {
        org_id: "org-a".to_string(),
        org_name: "Org A".to_string(),
        lineage_id: "lineage-a".to_string(),
        scenario: "migration".to_string(),
        context: "food scarce".to_string(),
        ..Default::default()
    });

    let mut expected_rng = sim.rng.clone();
    let expected_next: u64 = expected_rng.random();

    sim.save_result(&path_s).unwrap();
    let mut loaded = Simulation::load_or_new(999, &path_s);

    assert_eq!(
        loaded.lineage_strategies.get(&guided_lineage),
        Some(&("settle".to_string(), 13_000))
    );
    let objective = loaded.lineage_strategy_objectives.get(&guided_lineage).unwrap();
    assert_eq!(objective.strategy, "settle");
    assert_eq!(objective.started_tick, 12_000);
    assert_eq!(objective.expires_tick, 13_000);
    assert_eq!(objective.progress, 27);
    assert_eq!(objective.target, 90);
    assert_eq!(objective.completed_tick, None);
    assert_eq!(objective.failed_tick, None);
    assert_eq!(loaded.lineage_strategy_history.len(), 1);
    let campaign = loaded.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.lineage_id, "lineage-a");
    assert_eq!(campaign.strategy, "trade");
    assert_eq!(campaign.outcome, "completed");
    assert_eq!(campaign.ended_tick, 11_800);
    assert_eq!(loaded.lineage_last_council.get("lineage-a"), Some(&12_000));
    assert_eq!(
        loaded.lineage_elders.get("lineage-a"),
        Some(&"elder-a".to_string())
    );
    assert_eq!(
        loaded
            .lineage_negotiations
            .get(&("lineage-a".to_string(), "lineage-b".to_string())),
        Some(&11_500)
    );
    assert_eq!(loaded.pending_thinks.len(), 1);
    assert_eq!(loaded.pending_thinks[0].scenario, "migration");
    assert_eq!(loaded.rng.random::<u64>(), expected_next);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(&tmp_s);
}

#[test]
fn save_load_preserves_organism_cooldowns_for_deterministic_replay() {
    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-cooldown-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    let mut sim = Simulation::new(42);
    sim.tick_count = 50_000;
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].last_think_tick = 1_000;
    sim.organisms[idx].last_invention_tick = 2_000;
    sim.organisms[idx].last_experiment_tick = 3_000;
    let org_id = sim.organisms[idx].id.clone();

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(999, &path_s);

    let loaded_org = loaded.organisms.iter().find(|o| o.id == org_id).unwrap();
    assert_eq!(
        loaded_org.last_think_tick, 1_000,
        "cooldown was jittered on load - breaks determinism"
    );
    assert_eq!(
        loaded_org.last_invention_tick, 2_000,
        "cooldown was jittered on load - breaks determinism"
    );
    assert_eq!(
        loaded_org.last_experiment_tick, 3_000,
        "experiment evidence was lost on load"
    );

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn save_load_preserves_in_progress_flood_tiles() {
    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-flood-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    let mut sim = Simulation::new(7);
    sim.tick_count = 100;
    sim.flood_tiles = vec![(10, 20, 200), (30, 40, 250)];

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(999, &path_s);

    assert_eq!(loaded.flood_tiles, vec![(10, 20, 200), (30, 40, 250)]);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn save_load_preserves_civilization_and_personal_progress() {
    use crate::sim::buildings::{Building, BuildingKind};
    use crate::sim::culture::{Religion, ReligionKind};
    use crate::sim::government::{Government, GovernmentKind};
    use crate::sim::warfare::FieldFortification;

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-world-continuity-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    let mut sim = Simulation::new(23);
    sim.tick_count = 42_000;
    sim.buildings.push(Building::new(
        41,
        BuildingKind::Library,
        100,
        80,
        Some("lineage-a".to_string()),
        40_000,
    ));
    sim.next_building_id = 42;
    sim.governments.insert(
        "lineage-a".to_string(),
        Government::new("lineage-a".to_string(), GovernmentKind::Republic, 30_000),
    );
    sim.governments.get_mut("lineage-a").unwrap().tax_receipts_pending = 17;
    sim.religions.push(Religion {
        id: "faith-a".to_string(),
        kind: ReligionKind::Animism,
        name: "The River Way".to_string(),
        founded_tick: 20_000,
        founder_lineage: "lineage-a".to_string(),
        adherents: 12,
        last_milestone: Some(10),
    });
    sim.milestones_achieved.insert("first_library".to_string());
    sim.headlines.push_back((41_500, "A library opened".to_string()));
    sim.water_use.insert((100, 80), 17);
    sim.grid.add_structure(101, 80, 0.12);
    sim.active_structure_tiles.insert((101, 80));
    sim.field_fortifications.push(FieldFortification {
        x: 101,
        y: 80,
        lineage_id: "lineage-a".to_string(),
    });

    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    let org_id = sim.organisms[idx].id.clone();
    sim.organisms[idx].wealth = 321;
    sim.organisms[idx].literacy = 0.84;
    sim.organisms[idx].mood = 0.73;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].religion_id = Some("faith-a".to_string());
    sim.organisms[idx]
        .last_think_by_kind
        .insert("discovery".to_string(), 41_000);
    sim.organisms[idx].is_leader = true;

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(999, &path_s);

    assert_eq!(loaded.buildings.len(), 1);
    assert_eq!(loaded.buildings[0].kind, BuildingKind::Library);
    assert_eq!(loaded.next_building_id, 42);
    assert_eq!(loaded.governments["lineage-a"].kind, GovernmentKind::Republic);
    assert_eq!(loaded.governments["lineage-a"].tax_receipts_pending, 17);
    assert_eq!(loaded.religions[0].name, "The River Way");
    assert!(loaded.milestones_achieved.contains("first_library"));
    assert_eq!(loaded.headlines.back().unwrap().1, "A library opened");
    assert_eq!(loaded.water_use.get(&(100, 80)), Some(&17));
    assert_eq!(
        loaded.field_fortifications,
        vec![FieldFortification {
            x: 101,
            y: 80,
            lineage_id: "lineage-a".to_string(),
        }]
    );
    assert_eq!(loaded.physics.tick_count, 8_400);

    let loaded_org = loaded.organisms.iter().find(|o| o.id == org_id).unwrap();
    assert_eq!(loaded_org.wealth, 321);
    assert_eq!(loaded_org.literacy, 0.84);
    assert_eq!(loaded_org.mood, 0.73);
    assert_eq!(loaded_org.specialty.as_deref(), Some("scholar"));
    assert_eq!(loaded_org.religion_id.as_deref(), Some("faith-a"));
    assert_eq!(loaded_org.last_think_by_kind.get("discovery"), Some(&41_000));
    assert!(loaded_org.is_leader);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn queued_think_triggers_copy_live_organism_traits() {
    let mut sim = Simulation::new(13);
    let org_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[org_idx].traits.aggression = 0.91;
    sim.organisms[org_idx].traits.fear = 0.12;
    sim.organisms[org_idx].traits.social_tendency = 0.34;
    sim.organisms[org_idx].traits.curiosity = 0.56;
    sim.organisms[org_idx].traits.resilience = 0.78;

    sim.push_think_for(
        org_idx,
        ThinkTrigger {
            org_id: sim.organisms[org_idx].id.clone(),
            scenario: "first_contact".to_string(),
            ..Default::default()
        },
    );

    let trigger = sim.pending_thinks.last().unwrap();
    assert_eq!(trigger.aggression, 0.91);
    assert_eq!(trigger.fear, 0.12);
    assert_eq!(trigger.social_tendency, 0.34);
    assert_eq!(trigger.curiosity, 0.56);
    assert_eq!(trigger.resilience, 0.78);
}

#[test]
fn viewport_state_includes_all_alive_when_viewport_spans_world() {
    // VP_W = WIDTH and VP_H = HEIGHT, so the in_view filter must
    // never drop entities just because the centroid is off-center.
    // (Previously a centroid-centered AABB could slide past the
    // world edge and silently exclude orgs / animals on the far
    // side. That caused "animals not showing" reports.)
    let mut sim = Simulation::new(19);
    sim.tick_count = 2;
    let near_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[near_idx].x = 10.0;
    sim.organisms[near_idx].y = 10.0;
    let near_id = sim.organisms[near_idx].id.clone();

    let far_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != near_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[far_idx].x = (WIDTH - 10) as f32;
    sim.organisms[far_idx].y = (HEIGHT - 10) as f32;
    let far_id = sim.organisms[far_idx].id.clone();

    let state = sim.state_json_at(10, 10);
    let ids: Vec<String> = state["organisms_hot"]["ids"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    assert!(ids.contains(&near_id), "centroid-local org must ship");
    assert!(
        ids.contains(&far_id),
        "with full-world viewport, the far-corner org must also ship"
    );
    assert_eq!(state["organisms_complete"], false);
    assert!(
        state.get("organisms").is_none(),
        "deltas should not carry the AoS organisms array"
    );
}

#[test]
fn incremental_state_omits_cold_world_metadata() {
    let mut sim = Simulation::new(29);
    sim.tick_count = 2;

    let state = sim.state_json_at(10, 10);
    let obj = state.as_object().unwrap();

    for key in [
        "events",
        "history",
        "story_history",
        "pop_history",
        "tribal_relations",
        "lineage_sizes",
        "lineage_names",
        "current_era",
        "sex_words",
    ] {
        assert!(
            !obj.contains_key(key),
            "incremental frame unexpectedly included cold key {key}",
        );
    }
}

#[test]
fn full_state_keeps_cold_world_metadata() {
    let mut sim = Simulation::new(31);
    sim.tick_count = 2;

    let state = sim.state_json();
    let obj = state.as_object().unwrap();

    for key in [
        "events",
        "history",
        "story_history",
        "pop_history",
        "tribal_relations",
        "lineage_sizes",
        "lineage_names",
        "current_era",
        "sex_words",
    ] {
        assert!(obj.contains_key(key), "full frame omitted cold key {key}");
    }
}

#[test]
fn current_position_spatial_query_excludes_far_organisms() {
    let mut sim = Simulation::new(23);
    let center_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[center_idx].x = 20.0;
    sim.organisms[center_idx].y = 20.0;

    let near_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != center_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[near_idx].x = 24.0;
    sim.organisms[near_idx].y = 20.0;

    let far_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != center_idx && *i != near_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[far_idx].x = 80.0;
    sim.organisms[far_idx].y = 80.0;

    let nearby = sim.current_nearby_organisms(20, 20, 6);
    assert!(nearby.contains(&center_idx));
    assert!(nearby.contains(&near_idx));
    assert!(!nearby.contains(&far_idx));
}

#[test]
fn animal_population_does_not_respawn_without_living_adults() {
    let mut sim = Simulation::new(29);
    sim.animals.clear();

    sim.tick_animals();

    assert_eq!(sim.animals.iter().filter(|a| a.alive).count(), 0);
}

#[test]
fn deep_water_fatigue_causes_panic_and_marks_danger() {
    let mut sim = Simulation::new(33);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].x = 50.0;
    sim.organisms[idx].y = 50.0;
    sim.organisms[idx].energy = 0.9;
    sim.organisms[idx].health = 0.9;
    sim.organisms[idx].fear_level = 0.1;
    sim.organisms[idx].water_ticks = 13;
    sim.grid.set(50, 50, Tile::Water);
    sim.grid.depth[WorldGrid::idx(50, 50)] = 0.8;
    sim.grid.set(51, 50, Tile::Grass);

    sim.apply_water_fatigue(idx, 50, 50);

    assert!(sim.organisms[idx].energy < 0.9);
    assert!(sim.organisms[idx].health < 0.9);
    assert!(sim.organisms[idx].fear_level > 0.1);
    let escape = sim.organisms[idx]
        .wander_target
        .expect("swimmer should pick nearby land");
    assert_ne!(sim.grid.get(escape.0, escape.1), Tile::Water);
    assert!(sim.organisms[idx].danger_memory.contains_key(&(50, 50)));
}

#[test]
fn curious_adults_choose_distant_land_expeditions() {
    let mut sim = Simulation::new(35);
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].id = "curious-adult".to_string();
    sim.organisms[idx].x = (WIDTH / 2) as f32;
    sim.organisms[idx].y = (HEIGHT / 2) as f32;
    sim.organisms[idx].age = 2_000;
    sim.organisms[idx].energy = 0.95;
    sim.organisms[idx].hydration = 0.95;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].traits.curiosity = 0.9;
    let curiosity = sim.organisms[idx].traits.curiosity;
    let hash = sim.organisms[idx]
        .id
        .bytes()
        .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
    let period = (450u64).saturating_sub((curiosity * 200.0) as u64).max(140);
    sim.tick_count = hash % period;

    sim.validate_or_assign_wander_target(idx);

    let target = sim.organisms[idx]
        .wander_target
        .expect("curious adult should choose a land expedition");
    let dist =
        (target.0 - sim.organisms[idx].x as i32).abs() + (target.1 - sim.organisms[idx].y as i32).abs();
    let expected_min = 60 + (curiosity * 90.0) as i32;
    assert!(
        dist >= expected_min,
        "dist={} curiosity={} period={} tick_count={} expected>={}",
        dist,
        curiosity,
        period,
        sim.tick_count,
        expected_min
    );
    assert_eq!(sim.grid.get(target.0, target.1), Tile::Grass);
}

#[test]
fn founders_spread_across_world_sectors() {
    for seed in [1u64, 7, 42, 99, 137] {
        let sim = Simulation::new(seed);
        let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
        assert!(
            alive.len() >= 100,
            "seed {seed} fewer founders than expected: {}",
            alive.len()
        );

        let xs: Vec<f32> = alive.iter().map(|o| o.x).collect();
        let ys: Vec<f32> = alive.iter().map(|o| o.y).collect();
        let xmin = xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let xmax = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let ymin = ys.iter().cloned().fold(f32::INFINITY, f32::min);
        let ymax = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let span_x = xmax - xmin;
        let span_y = ymax - ymin;

        assert!(
            span_x >= WIDTH as f32 * 0.40,
            "seed {seed} founders span only {} of {} tiles wide",
            span_x,
            WIDTH
        );
        assert!(
            span_y >= HEIGHT as f32 * 0.30,
            "seed {seed} founders span only {} of {} tiles tall",
            span_y,
            HEIGHT
        );

        use std::collections::HashMap;
        let mut by_lid: HashMap<String, Vec<(f32, f32)>> = HashMap::new();
        for o in &alive {
            by_lid.entry(o.lineage_id.clone()).or_default().push((o.x, o.y));
        }
        let centroids: Vec<(f32, f32)> = by_lid
            .values()
            .map(|pts| {
                let n = pts.len() as f32;
                let cx = pts.iter().map(|p| p.0).sum::<f32>() / n;
                let cy = pts.iter().map(|p| p.1).sum::<f32>() / n;
                (cx, cy)
            })
            .collect();
        assert!(
            centroids.len() >= 6,
            "seed {seed} only produced {} lineages",
            centroids.len()
        );
        let cxmin = centroids.iter().map(|c| c.0).fold(f32::INFINITY, f32::min);
        let cxmax = centroids.iter().map(|c| c.0).fold(f32::NEG_INFINITY, f32::max);
        let cymin = centroids.iter().map(|c| c.1).fold(f32::INFINITY, f32::min);
        let cymax = centroids.iter().map(|c| c.1).fold(f32::NEG_INFINITY, f32::max);
        assert!(
            cxmax - cxmin >= WIDTH as f32 * 0.30,
            "seed {seed} lineage centroids only {} wide",
            cxmax - cxmin
        );
        assert!(
            cymax - cymin >= HEIGHT as f32 * 0.20,
            "seed {seed} lineage centroids only {} tall",
            cymax - cymin
        );
    }
}

#[test]
fn population_stays_dispersed_after_many_days() {
    for seed in [42u64, 99] {
        let mut sim = Simulation::new(seed);
        for _ in 0..9_000 {
            sim.tick();
        }
        let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
        assert!(
            alive.len() >= 80,
            "seed {seed} population collapsed to {} after 3 days",
            alive.len()
        );

        let n = alive.len() as f32;
        let mx = alive.iter().map(|o| o.x).sum::<f32>() / n;
        let my = alive.iter().map(|o| o.y).sum::<f32>() / n;
        let varx = alive.iter().map(|o| (o.x - mx).powi(2)).sum::<f32>() / n;
        let vary = alive.iter().map(|o| (o.y - my).powi(2)).sum::<f32>() / n;
        let stdx = varx.sqrt();
        let stdy = vary.sqrt();

        // Anti-collapse guard: the world must stay meaningfully spread,
        // not clump to a single point. Threshold kept well below the
        // natural operating point (~0.20 of WIDTH on the test seeds) so
        // it (a) still catches a real collapse — which reads as <0.08 —
        // and (b) tolerates both cross-architecture float drift (arm
        // dev vs x86 CI diverge over 9000 chaotic ticks) and the
        // intended village-clustering from the social-gravitation ticks.
        assert!(
            stdx >= WIDTH as f32 * 0.12,
            "seed {seed} stdx {stdx} too small (clustered) - WIDTH={WIDTH}"
        );
        assert!(
            stdy >= HEIGHT as f32 * 0.08,
            "seed {seed} stdy {stdy} too small (clustered) - HEIGHT={HEIGHT}"
        );
    }
}

#[test]
fn population_does_not_reconverge_after_growth_window() {
    let mut sim = Simulation::new(7);
    for _ in 0..3_000 {
        sim.tick();
    }
    let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
    assert!(
        alive.len() >= 60,
        "population collapsed to {} after growth window",
        alive.len()
    );

    let cw = 60i32;
    let ch = 60i32;
    let mut buckets: std::collections::HashMap<(i32, i32), u32> = Default::default();
    for o in &alive {
        let cx = (o.x as i32) / cw;
        let cy = (o.y as i32) / ch;
        *buckets.entry((cx, cy)).or_insert(0) += 1;
    }
    let max_bucket = buckets.values().copied().max().unwrap_or(0) as f32;
    let frac = max_bucket / alive.len() as f32;
    assert!(
        frac <= 0.65,
        "after 3k ticks {:.0}% of population sits in a single 60x60 cell ({})",
        frac * 100.0,
        max_bucket as u32
    );
}

#[test]
fn dense_animal_clusters_stop_reproducing() {
    let mut sim = Simulation::new(31);
    sim.animals.clear();
    for i in 0..20 {
        let mut a = Animal::new(i, 50.0, 50.0, AnimalKind::Rabbit);
        a.energy = 0.95;
        a.last_reproduced = 0;
        sim.animals.push(a);
    }
    sim.next_animal_id = 100;
    sim.tick_count = 5_000;

    for _ in 0..2_000 {
        sim.tick_animals();
    }

    let alive = sim.animals.iter().filter(|a| a.alive).count();
    assert!(
        alive <= 35,
        "dense cluster ran away to {alive} animals - carrying-capacity factor isn't working"
    );
}

/// Friend-seek must respect the 60-tile distance cap. A lonely
/// org with only far-away friends should NOT set a wander_target
/// that pulls them across the map (the one-island attractor bug).
#[test]
fn lonely_org_with_only_distant_friends_stays_put() {
    use crate::organism::organism::{apply_sex_traits, generate_name, Organism, Sex};
    use crate::organism::traits::Traits;
    let mut sim = Simulation::new(0xdef0);
    // Wipe founders so we control the cast.
    sim.organisms.clear();

    // Lonely main org at (50, 50).
    let mut traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut traits, Sex::Female);
    let mut me = Organism::new(
        "me-id".into(),
        generate_name(&mut sim.rng, Sex::Female),
        50.0,
        50.0,
        1,
        "".into(),
        "lid-a".into(),
        20_000,
        traits,
    );
    me.alive = true;
    me.sex = Sex::Female;
    me.age = 1500;
    me.energy = 0.8;
    me.loneliness = 0.85;
    // Single named friend at (500, 250) - way past the 60-tile cap.
    me.friends.insert("far-id".into(), "FarFriend".into());
    sim.organisms.push(me);

    let mut friend_traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut friend_traits, Sex::Male);
    let mut far = Organism::new(
        "far-id".into(),
        "FarFriend".into(),
        500.0,
        250.0,
        1,
        "".into(),
        "lid-b".into(),
        20_000,
        friend_traits,
    );
    far.alive = true;
    far.sex = Sex::Male;
    far.age = 1500;
    sim.organisms.push(far);

    sim.tick_count = 5_000;

    // Drive the per-org tick to exercise the friend-seek block.
    let alive_count = 2;
    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lid-a".into(), 1);
    lineage_counts.insert("lid-b".into(), 1);
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let mut spatial_buf: Vec<usize> = Vec::new();
    let org_idx_by_id: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    sim.tick_organism(
        0,
        alive_count,
        &lineage_counts,
        &spatial,
        &mut spatial_buf,
        &org_idx_by_id,
    );

    assert!(
        sim.organisms[0].wander_target.is_none(),
        "lonely org with no in-range friends should NOT walk \
         toward a friend 600 tiles away - wander_target was {:?}",
        sim.organisms[0].wander_target
    );
}

/// And the opposite: a friend WITHIN the 60-tile cap should
/// produce a wander_target pointing at them.
#[test]
fn lonely_org_with_nearby_friend_walks_toward_them() {
    use crate::organism::organism::{apply_sex_traits, generate_name, Organism, Sex};
    use crate::organism::traits::Traits;
    let mut sim = Simulation::new(0xdef1);
    sim.organisms.clear();

    let mut traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut traits, Sex::Female);
    let mut me = Organism::new(
        "me-id".into(),
        generate_name(&mut sim.rng, Sex::Female),
        50.0,
        50.0,
        1,
        "".into(),
        "lid-a".into(),
        20_000,
        traits,
    );
    me.alive = true;
    me.sex = Sex::Female;
    me.age = 1500;
    me.energy = 0.8;
    me.loneliness = 0.85;
    me.friends.insert("near-id".into(), "NearFriend".into());
    sim.organisms.push(me);

    let mut friend_traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut friend_traits, Sex::Male);
    let mut near = Organism::new(
        "near-id".into(),
        "NearFriend".into(),
        70.0,
        70.0,
        1,
        "".into(),
        "lid-b".into(),
        20_000,
        friend_traits,
    );
    near.alive = true;
    near.sex = Sex::Male;
    near.age = 1500;
    sim.organisms.push(near);

    sim.tick_count = 5_000;

    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lid-a".into(), 1);
    lineage_counts.insert("lid-b".into(), 1);
    let spatial2 = SpatialIndex::build(&sim.organisms, 10);
    let mut spatial_buf2: Vec<usize> = Vec::new();
    let org_idx_by_id2: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    sim.tick_organism(
        0,
        2,
        &lineage_counts,
        &spatial2,
        &mut spatial_buf2,
        &org_idx_by_id2,
    );

    let wt = sim.organisms[0].wander_target;
    assert!(wt.is_some(), "in-range friend should set wander_target, got None");
    // Should be roughly where NearFriend is.
    if let Some((tx, ty)) = wt {
        assert!(
            (tx - 70).abs() <= 5 && (ty - 70).abs() <= 5,
            "wander_target {:?} should point near (70,70)",
            wt
        );
    }
}
