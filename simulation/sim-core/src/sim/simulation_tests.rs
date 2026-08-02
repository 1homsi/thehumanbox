use super::*;

#[test]
fn wildfire_displaces_wildlife_and_dogs_do_not_follow_owners_back_into_danger() {
    let mut sim = Simulation::new(0xEC0_F1A1);
    sim.tick_count = 1;
    for organism in &mut sim.organisms {
        organism.alive = false;
    }
    sim.organisms[0].alive = true;
    sim.organisms[0].x = 135.0;
    sim.organisms[0].y = 120.0;
    let owner_id = sim.organisms[0].id.clone();
    for y in 110..=130 {
        for x in 105..=140 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.grid.set(123, 120, Tile::Fire);
    *sim.grid.fire_intensity_mut(123, 120) = 1.0;
    sim.physics.register_fire(123, 120);
    sim.animals.clear();
    let mut dog = Animal::new(10, 120.0, 120.0, AnimalKind::Dog);
    dog.bonded_org = Some(owner_id);
    sim.animals.push(dog);
    sim.animals
        .push(Animal::new(11, 120.0, 119.0, AnimalKind::Rabbit));
    sim.animals.push(Animal::new(12, 120.0, 121.0, AnimalKind::Deer));

    sim.tick_animals();

    let dog = sim.animals.iter().find(|animal| animal.id == 10).unwrap();
    assert!(
        dog.x < 120.0,
        "fire safety must override following the owner eastward"
    );
    assert!(sim
        .events
        .iter()
        .any(|event| { event.actor == "wildlife" && event.detail == "3 wildlife fled an advancing fire" }));

    let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
    let loaded_dog = loaded.animals.iter().find(|animal| animal.id == 10).unwrap();
    assert_eq!((loaded_dog.x, loaded_dog.y), (dog.x, dog.y));
    assert!(loaded
        .events
        .iter()
        .any(|event| { event.actor == "wildlife" && event.detail == "3 wildlife fled an advancing fire" }));
}

#[test]
fn succession_prefers_partner_then_oldest_child_before_friendship() {
    let mut sim = Simulation::new(0x5A11_CCE5);
    for organism in &mut sim.organisms {
        organism.alive = false;
    }
    let dead = 0;
    let partner = 1;
    let younger_child = 2;
    let older_child = 3;
    let friend = 4;
    for index in [dead, partner, younger_child, older_child, friend] {
        sim.organisms[index].alive = true;
    }
    let dead_id = sim.organisms[dead].id.clone();
    let partner_id = sim.organisms[partner].id.clone();
    let friend_id = sim.organisms[friend].id.clone();
    sim.organisms[dead].partner_id = Some(partner_id);
    sim.organisms[younger_child].parent_id = dead_id.clone();
    sim.organisms[younger_child].age = 200;
    sim.organisms[older_child].father_id = Some(dead_id.clone());
    sim.organisms[older_child].age = 600;
    sim.organisms[dead].friends.insert(friend_id, "Friend".into());

    assert_eq!(
        choose_heir_index(&sim.organisms, dead),
        Some((partner, HeirKind::Partner))
    );

    sim.organisms[partner].alive = false;
    assert_eq!(
        choose_heir_index(&sim.organisms, dead),
        Some((older_child, HeirKind::Child))
    );
}

#[test]
fn familyless_death_bequeaths_to_strongest_friend_and_closes_the_live_bond() {
    let mut sim = Simulation::new(0xF21E_1E6A);
    for organism in &mut sim.organisms {
        organism.alive = false;
    }
    let dead = 0;
    let weaker_friend = 1;
    let stronger_friend = 2;
    let nearby_kin = 3;
    for index in [dead, weaker_friend, stronger_friend, nearby_kin] {
        sim.organisms[index].alive = true;
        sim.organisms[index].energy = 1.0;
        sim.organisms[index].hydration = 1.0;
        sim.organisms[index].health = 1.0;
        sim.organisms[index].wealth = 0;
        sim.organisms[index].x = 100.0 + index as f32;
        sim.organisms[index].y = 100.0;
    }
    sim.organisms[dead].lineage_id = "river".into();
    sim.organisms[nearby_kin].lineage_id = "river".into();
    sim.organisms[weaker_friend].lineage_id = "forest".into();
    sim.organisms[stronger_friend].lineage_id = "mountain".into();
    let dead_id = sim.organisms[dead].id.clone();
    let weaker_id = sim.organisms[weaker_friend].id.clone();
    let stronger_id = sim.organisms[stronger_friend].id.clone();
    let dead_name = sim.organisms[dead].name.clone();
    sim.organisms[dead]
        .friends
        .insert(weaker_id.clone(), "Weaker".into());
    sim.organisms[dead]
        .friends
        .insert(stronger_id.clone(), "Stronger".into());
    sim.organisms[weaker_friend]
        .friends
        .insert(dead_id.clone(), dead_name.clone());
    sim.organisms[stronger_friend]
        .friends
        .insert(dead_id.clone(), dead_name.clone());
    sim.organisms[dead].org_trust.insert(weaker_id.clone(), 0.30);
    sim.organisms[weaker_friend]
        .org_trust
        .insert(dead_id.clone(), 0.30);
    sim.organisms[dead].org_trust.insert(stronger_id.clone(), 0.80);
    sim.organisms[stronger_friend]
        .org_trust
        .insert(dead_id.clone(), 0.75);
    sim.organisms[dead].wealth = 47;
    sim.organisms[dead].energy = 0.0;

    assert_eq!(
        choose_heir_index(&sim.organisms, dead),
        Some((stronger_friend, HeirKind::Friend))
    );
    sim.tick();

    assert!(!sim.organisms[dead].alive);
    assert_eq!(sim.organisms[dead].wealth, 0);
    assert_eq!(sim.organisms[stronger_friend].wealth, 47);
    assert_eq!(sim.organisms[weaker_friend].wealth, 0);
    assert_eq!(sim.organisms[nearby_kin].wealth, 0);
    assert!(sim.organisms[stronger_friend].grief_ticks >= 140);
    assert!(!sim.organisms[stronger_friend].friends.contains_key(&dead_id));
    assert!(sim.organisms[stronger_friend].life_log.iter().any(|entry| {
        entry.category == "loss"
            && entry.related_id.as_deref() == Some(dead_id.as_str())
            && entry.text.contains("lost my friend")
    }));
    assert!(sim.events.iter().any(|event| {
        event.etype == "trade"
            && event.detail.contains("inherited 47")
            && event.detail.contains("closest friend")
    }));
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

    assert!(!sim.lineage_strategy_objectives.contains_key(&lineage_id));
    assert!(!sim.lineage_strategies.contains_key(&lineage_id));
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
fn strategy_progress_announces_each_major_milestone_once() {
    let mut sim = Simulation::new(0x4D11_3570);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_names
        .insert(lineage_id.clone(), "Pathmakers".to_string());
    sim.start_strategy_objective(&lineage_id, "explore", 500);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 8;

    for _ in 0..7 {
        sim.record_strategy_progress(&lineage_id, "explore");
    }

    let progress_events: Vec<&Event> = sim
        .events
        .iter()
        .filter(|event| event.etype == "strategy_progress")
        .collect();
    assert_eq!(progress_events.len(), 3);
    assert!(progress_events[0].detail.contains("25% (2/8)"));
    assert!(progress_events[1].detail.contains("50% (4/8)"));
    assert!(progress_events[2].detail.contains("75% (6/8)"));

    sim.record_strategy_progress(&lineage_id, "explore");
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_progress")
            .count(),
        3
    );
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_complete")
            .count(),
        1
    );
}

#[test]
fn completed_strategy_is_idle_and_can_be_started_again_cleanly() {
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
    assert!(!sim.lineage_strategy_objectives.contains_key(&lineage_id));
    assert_eq!(sim.lineage_strategy_history.len(), 1);

    // Stray aligned actions after completion cannot pay the reward twice.
    sim.record_strategy_progress(&lineage_id, "trade");
    assert_eq!(sim.lineage_strategy_history.len(), 1);
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| organism.wealth == 3));

    sim.start_strategy_objective(&lineage_id, "trade", 300);
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].progress, 0);
    assert_eq!(sim.lineage_strategy_objectives[&lineage_id].expires_tick, 300);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;
    sim.record_strategy_progress(&lineage_id, "trade");

    assert_eq!(sim.lineage_strategy_history.len(), 2);
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| organism.wealth == 6));
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

    assert!(!sim.lineage_strategy_objectives.contains_key(&lineage_id));
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
            (organism.hope - 0.48).abs() < f32::EPSILON && (organism.boredom - 0.115).abs() < f32::EPSILON
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
fn completing_campaign_returns_lineage_to_autonomy_without_erasing_personal_directives() {
    let mut sim = Simulation::new(0xA070_10A0);
    sim.tick_count = 500;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    let lineage_members: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, organism)| organism.alive && organism.lineage_id == lineage_id)
        .map(|(index, _)| index)
        .take(2)
        .collect();
    assert_eq!(lineage_members.len(), 2);
    let guided = lineage_members[0];
    sim.organisms[guided].age = sim.organisms[guided].max_age / 2;
    let personally_directed = lineage_members[1];
    sim.organisms[personally_directed].directive = "flee".to_string();
    sim.organisms[personally_directed].directive_until = 900;

    let command =
        format!(r#"{{"cmd":"guide","lineage":"{lineage_id}","strategy":"explore","duration_ticks":600}}"#);
    assert!(sim.apply_command_json(&command));
    assert_eq!(sim.organisms[guided].directive, "explore");
    assert_eq!(sim.organisms[personally_directed].directive, "flee");
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&lineage_id, "explore");

    assert!(!sim.lineage_strategies.contains_key(&lineage_id));
    assert!(!sim.lineage_strategy_objectives.contains_key(&lineage_id));
    assert!(sim.organisms[guided].directive.is_empty());
    assert_eq!(sim.organisms[guided].directive_until, 0);
    assert_eq!(sim.organisms[personally_directed].directive, "flee");
    assert_eq!(sim.organisms[personally_directed].directive_until, 900);
    let state = sim.state_json();
    assert_eq!(state["lineage_strategies"], serde_json::json!({}));
}

#[test]
fn near_complete_strategy_salvages_a_reduced_reward() {
    let mut sim = Simulation::new(0x50_1A_6E);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_names
        .insert(lineage_id.clone(), "Near Horizon".to_string());
    sim.start_strategy_objective(&lineage_id, "trade", 110);
    sim.lineage_strategies
        .insert(lineage_id.clone(), ("trade".to_string(), 110));
    let objective = sim.lineage_strategy_objectives.get_mut(&lineage_id).unwrap();
    objective.progress = 8;
    objective.target = 10;
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.hope = 0.50;
        organism.joy_ticks = 0;
        organism.wealth = 0;
    }

    sim.tick_count = 110;
    sim.resolve_strategy_objective_expirations();

    let campaign = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.outcome, "partial");
    assert_eq!(campaign.reason.as_deref(), Some("deadline"));
    assert_eq!(campaign.progress, 8);
    assert_eq!(campaign.target, 10);
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_partial")
            .count(),
        1
    );
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "strategy_failed")
            .count(),
        0
    );
    assert!(sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .all(|organism| {
            (organism.hope - 0.53).abs() < f32::EPSILON && organism.joy_ticks == 60 && organism.wealth == 1
        }));
}

#[test]
fn strategy_targets_scale_with_population_and_action_frequency() {
    let small_exploration = strategy_objective_target(1_200, 2, "explore");
    let large_exploration = strategy_objective_target(1_200, 20, "explore");
    let large_trade = strategy_objective_target(1_200, 20, "trade");

    assert!(large_exploration > small_exploration * 8);
    assert!(large_trade < large_exploration);
    assert_eq!(strategy_objective_target(60, 1, "trade"), 30);
}

#[test]
fn campaign_readiness_tracks_capable_people_prey_and_trade_partners() {
    use crate::organism::animal::{Animal, AnimalKind};

    let mut sim = Simulation::new(0x4EAD_1E55);
    let lineage_id = sim.organisms[0].lineage_id.clone();
    for organism in &mut sim.organisms {
        organism.lineage_id.clone_from(&lineage_id);
        organism.alive = true;
        organism.age = organism.max_age / 2;
        organism.health = 1.0;
        organism.energy = 1.0;
    }
    sim.animals.clear();

    assert_eq!(
        sim.lineage_strategy_readiness(&lineage_id, "hunt"),
        Err("no_living_prey")
    );
    assert_eq!(
        sim.lineage_strategy_readiness(&lineage_id, "trade"),
        Err("no_foreign_lineage")
    );
    for strategy in ["explore", "settle", "defend"] {
        assert_eq!(sim.lineage_strategy_readiness(&lineage_id, strategy), Ok(()));
    }

    sim.animals
        .push(Animal::new(99_001, 100.0, 100.0, AnimalKind::Deer));
    assert_eq!(sim.lineage_strategy_readiness(&lineage_id, "hunt"), Ok(()));
    sim.organisms.last_mut().unwrap().lineage_id = "foreign-lineage".to_string();
    assert_eq!(sim.lineage_strategy_readiness(&lineage_id, "trade"), Ok(()));

    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.lineage_id == lineage_id)
    {
        organism.age = 0;
    }
    assert_eq!(
        sim.lineage_strategy_readiness(&lineage_id, "explore"),
        Err("no_mobile_explorer")
    );
    assert_eq!(
        sim.lineage_strategy_readiness(&lineage_id, "settle"),
        Err("no_adult_worker")
    );
    assert_eq!(
        sim.lineage_strategy_readiness(&lineage_id, "defend"),
        Err("no_capable_defender")
    );
}

#[test]
fn completed_exploration_campaign_changes_the_world_and_records_impact() {
    let mut sim = Simulation::new(0x0E7F_10AE);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    let (frontier_x, frontier_y) = sim.lineage_campaign_frontier(&lineage_id).unwrap();
    sim.territory.remove(&lineage_id);
    sim.start_strategy_objective(&lineage_id, "explore", 200);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&lineage_id, "explore");

    assert!(sim
        .territory
        .get(&lineage_id)
        .is_some_and(|tiles| !tiles.is_empty()));
    assert!(sim.grid.trail_at(frontier_x, frontier_y, TrailKind::Path) > 0.0);
    let campaign = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(campaign.outcome, "completed");
    assert!(campaign
        .impact
        .as_deref()
        .is_some_and(|impact| impact.contains("new land tiles") && impact.contains("frontier trails")));
    assert!(sim
        .story_history
        .back()
        .is_some_and(|story| story.story.contains("frontier trails")));
}

#[test]
fn completed_defense_campaign_requires_material_for_a_real_fortification() {
    let mut sim = Simulation::new(0x00DE_F3AD);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.age = organism.max_age / 2;
        organism.inv_wood = 0;
        organism.inv_stone = 0;
    }
    let builder_index = sim
        .organisms
        .iter()
        .position(|organism| organism.alive && organism.lineage_id == lineage_id)
        .unwrap();
    sim.organisms[builder_index].inv_wood = 1;
    let fort_x = sim.organisms[builder_index].x.round() as i32;
    let fort_y = sim.organisms[builder_index].y.round() as i32;
    sim.start_strategy_objective(&lineage_id, "defend", 200);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&lineage_id, "defend");

    assert_eq!(sim.organisms[builder_index].inv_wood, 0);
    assert!(sim.field_fortifications.iter().any(|fortification| {
        fortification.x == fort_x && fortification.y == fort_y && fortification.lineage_id == lineage_id
    }));
    assert!(sim.active_structure_tiles.contains(&(fort_x, fort_y)));
    assert!(sim.lineage_strategy_history.back().unwrap().impact.is_some());
}

#[test]
fn completed_defense_campaign_does_not_conjure_a_free_fortification() {
    let mut sim = Simulation::new(0x00DE_F300);
    sim.tick_count = 100;
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.age = organism.max_age / 2;
        organism.inv_wood = 0;
        organism.inv_stone = 0;
    }
    sim.start_strategy_objective(&lineage_id, "defend", 200);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&lineage_id, "defend");

    assert!(sim.field_fortifications.is_empty());
    assert_eq!(sim.lineage_strategy_history.back().unwrap().impact, None);
}

#[test]
fn completed_settlement_campaign_starts_a_funded_unfinished_project() {
    use crate::sim::buildings::BuildingKind;

    let mut sim = Simulation::new(0x005E_771E);
    sim.tick_count = 100;
    sim.buildings.clear();
    let lineage_id = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.lineage_eras
        .insert(lineage_id.clone(), crate::sim::era::Era::Stone);
    for tile_y in 70..=130 {
        for tile_x in 70..=130 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(tile_x, tile_y)] = 0.0;
        }
    }
    for organism in sim
        .organisms
        .iter_mut()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
    {
        organism.age = organism.max_age / 2;
        organism.x = 100.0;
        organism.y = 100.0;
        organism.inv_wood = 9;
        organism.inv_stone = 9;
        organism.wealth = 100;
    }
    sim.start_strategy_objective(&lineage_id, "settle", 200);
    sim.lineage_strategy_objectives
        .get_mut(&lineage_id)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&lineage_id, "settle");

    let project = sim
        .buildings
        .iter()
        .find(|building| building.owner_lineage.as_deref() == Some(&lineage_id))
        .expect("campaign should start a funded project");
    assert_eq!(project.kind, BuildingKind::Hut);
    assert!(
        project.condition < 1.0,
        "campaign must not grant a finished building"
    );
    assert!(!project.is_operational());
    assert!(sim
        .lineage_strategy_history
        .back()
        .unwrap()
        .impact
        .as_deref()
        .is_some_and(|impact| impact.contains("funded a real hut construction project")));
}

#[test]
fn completed_trade_campaign_launches_a_real_caravan_when_a_route_exists() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(0x07AD_ECA7);
    sim.tick_count = 100;
    sim.buildings.clear();
    sim.trade_routes.clear();
    sim.caravans.clear();
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|organism| organism.alive)
        .map(|organism| organism.lineage_id.clone())
        .collect();
    lineages.sort();
    lineages.dedup();
    let sender_lineage = lineages[0].clone();
    let receiver_lineage = lineages[1].clone();
    let sender_index = sim
        .organisms
        .iter()
        .position(|organism| organism.alive && organism.lineage_id == sender_lineage)
        .unwrap();
    let receiver_index = sim
        .organisms
        .iter()
        .position(|organism| organism.alive && organism.lineage_id == receiver_lineage)
        .unwrap();
    sim.organisms[sender_index].x = 80.0;
    sim.organisms[sender_index].y = 80.0;
    sim.organisms[sender_index].inv_food = 6;
    sim.organisms[receiver_index].x = 120.0;
    sim.organisms[receiver_index].y = 80.0;
    let mut sender_hut = Building::new(1, BuildingKind::Hut, 80, 80, Some(sender_lineage.clone()), 0);
    sender_hut.condition = 1.0;
    let mut receiver_hut = Building::new(2, BuildingKind::Hut, 120, 80, Some(receiver_lineage), 0);
    receiver_hut.condition = 1.0;
    sim.buildings.extend([sender_hut, receiver_hut]);
    assert!(crate::sim::civ::trade_routes::establish_route(
        &mut sim,
        sender_index,
        receiver_index
    ));
    sim.start_strategy_objective(&sender_lineage, "trade", 200);
    sim.lineage_strategy_objectives
        .get_mut(&sender_lineage)
        .unwrap()
        .target = 1;

    sim.record_strategy_progress(&sender_lineage, "trade");

    assert_eq!(sim.caravans.len(), 1);
    assert_eq!(sim.caravans[0].sender_lineage, sender_lineage);
    assert!(sim
        .lineage_strategy_history
        .back()
        .unwrap()
        .impact
        .as_deref()
        .is_some_and(|impact| impact.contains("launched a caravan")));
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
    let population = loaded
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .count();
    assert_eq!(
        objective.target,
        strategy_objective_target(600, population, "settle")
    );
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
    let population = loaded
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        .count();
    assert_eq!(
        objective.target,
        strategy_objective_target(600, population, "trade")
    );
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
fn preserved_meat_feeds_an_organism_after_loose_food_runs_out() {
    let mut sim = Simulation::new(0xF00D_0121);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.20;
    sim.organisms[idx].inv_food = 0;
    sim.organisms[idx].tools.insert("preserved_meat".into(), 2);

    let (used_food, _) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(used_food);
    assert_eq!(sim.organisms[idx].tools.get("preserved_meat"), Some(&1));
    assert!(sim.organisms[idx].energy > 0.20);
}

#[test]
fn physical_survival_gear_outperforms_knowledge_without_an_item() {
    let mut sim = Simulation::new(0x6E4A_0122);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    let bare_night = night_energy_drain(&sim.organisms[idx]);
    let bare_cold = cold_exposure_multiplier(&sim.organisms[idx]);

    sim.organisms[idx].discoveries.insert("torch".into());
    sim.organisms[idx].discoveries.insert("leatherwork".into());
    let knowledge_night = night_energy_drain(&sim.organisms[idx]);
    let knowledge_cold = cold_exposure_multiplier(&sim.organisms[idx]);

    sim.organisms[idx].give_tool("lantern");
    sim.organisms[idx].give_tool("clothing");
    let equipped_night = night_energy_drain(&sim.organisms[idx]);
    let equipped_cold = cold_exposure_multiplier(&sim.organisms[idx]);

    assert!(knowledge_night < bare_night);
    assert!(equipped_night < knowledge_night);
    assert!(knowledge_cold < bare_cold);
    assert!(equipped_cold < knowledge_cold);
    assert!(terrain_energy_multiplier(&sim.organisms[idx], Tile::Snow) < 1.0);

    let clothing_snow = terrain_energy_multiplier(&sim.organisms[idx], Tile::Snow);
    sim.organisms[idx].give_tool("sled");
    assert!(terrain_energy_multiplier(&sim.organisms[idx], Tile::Snow) < clothing_snow);
}

#[test]
fn canoe_prevents_early_deep_water_panic_and_rewards_crossing() {
    let mut swimmer = Simulation::new(0xB047_0123);
    swimmer.organisms.truncate(1);
    let idx = 0;
    let (x, y) = (100, 100);
    swimmer.grid.set(x, y, Tile::Water);
    swimmer.grid.depth[WorldGrid::idx(x, y)] = 0.60;
    swimmer.organisms[idx].energy = 1.0;
    swimmer.organisms[idx].health = 1.0;
    swimmer.apply_water_fatigue(idx, x, y);
    let swimmer_energy = swimmer.organisms[idx].energy;
    let swimmer_health = swimmer.organisms[idx].health;

    let mut paddler = Simulation::new(0xB047_0123);
    paddler.organisms.truncate(1);
    paddler.grid.set(x, y, Tile::Water);
    paddler.grid.depth[WorldGrid::idx(x, y)] = 0.60;
    paddler.organisms[idx].energy = 1.0;
    paddler.organisms[idx].health = 1.0;
    paddler.organisms[idx].give_tool("canoe");
    paddler.apply_water_fatigue(idx, x, y);

    assert!(paddler.organisms[idx].energy > swimmer_energy);
    assert_eq!(paddler.organisms[idx].health, 1.0);
    assert!(swimmer_health < 1.0);
    assert!(watercraft_movement_bonus(&paddler.organisms[idx], &paddler.grid, Some((x, y))) > 0.0);
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
        impact: Some("opened a durable route".to_string()),
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
