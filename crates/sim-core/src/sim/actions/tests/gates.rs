//! Era, age, profession and context gates on what an organism may do.
use super::*;

#[test]
fn pre_stone_adult_does_not_receive_late_era_or_specialist_catalogue() {
    let mut sim = Simulation::new(11);
    let idx = 0;
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("programmer".to_string());
    sim.organisms[idx].literacy = 1.0;
    sim.organisms[idx].discoveries.insert("computer".to_string());
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.grid.set(x, y, Tile::Grass);

    let actions = actions_for(&sim, idx);
    for formal_knowledge in [67, 68, 70] {
        assert!(!actions.contains(&formal_knowledge));
    }
    assert!(actions.iter().any(|action| (386..=405).contains(action)));
    for late_communication in [406, 408, 414, 415, 416, 418, 419] {
        assert!(!actions.contains(&late_communication));
    }
    assert!(!actions.iter().any(|action| (421..=435).contains(action)));
    assert!(!actions.iter().any(|action| (456..=470).contains(action)));
    assert!(!actions.iter().any(|action| (475..=476).contains(action)));
    assert!(!actions.iter().any(|action| (483..=485).contains(action)));
    assert!(!actions.iter().any(|action| (501..=520).contains(action)));
    assert!(!actions.iter().any(|action| (39..=48).contains(action)));
    assert!(!actions.contains(&50));
    assert!(!actions.iter().any(|action| (166..=180).contains(action)));
    assert!(!actions.iter().any(|action| (276..=315).contains(action)));
    assert!(!actions.iter().any(|action| (336..=355).contains(action)));
    assert!(!actions.iter().any(|action| (436..=455).contains(action)));
    assert!(!actions.iter().any(|action| (536..=537).contains(action)));
    assert!(!actions.iter().any(|action| (540..=589).contains(action)));
    assert!(!actions.iter().any(|action| (840..=889).contains(action)));
    assert!(!actions.iter().any(|action| (4140..=4189).contains(action)));
    assert!(!actions.iter().any(|action| (5520..=5569).contains(action)));
    assert!(
        actions.len() < 600,
        "contextual sampling should stay compact, got {} actions",
        actions.len()
    );

    let spatial = SpatialIndex::build(&sim.organisms, 10);
    for formal_knowledge in [67, 68, 70] {
        assert!(
            try_apply(&mut sim, idx, formal_knowledge, x, y, &spatial).is_none(),
            "pre-stone action {formal_knowledge} bypassed semantic validation"
        );
    }
}

#[test]
fn era_and_profession_unlock_modern_technology_actions() {
    let mut sim = Simulation::new(12);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("engineer".to_string());
    sim.organisms[idx].discoveries.insert("electricity".to_string());

    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (840..=889).contains(action)));
    sim.lineage_eras.insert(lineage, Era::Modern);
    assert!(actions_for(&sim, idx)
        .iter()
        .any(|action| (840..=889).contains(action)));
}

#[test]
fn research_actions_require_an_operational_owned_workspace() {
    let mut sim = Simulation::new(13);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Information);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("programmer".to_string());
    sim.organisms[idx].literacy = 0.8;
    sim.organisms[idx].discoveries.insert("computer".to_string());
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);

    let mut lab = Building::new(
        99,
        BuildingKind::ResearchLab,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (5520..=5569).contains(action)));

    lab.condition = 1.0;
    lab.decorative = true;
    sim.buildings.push(lab);
    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (5520..=5569).contains(action)));

    sim.buildings[0].decorative = false;
    sim.buildings[0].owner_lineage = Some("other-lineage".to_string());
    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (5520..=5569).contains(action)));

    sim.buildings[0].owner_lineage = Some(sim.organisms[idx].lineage_id.clone());
    assert!(actions_for(&sim, idx)
        .iter()
        .any(|action| (5520..=5569).contains(action)));
}

#[test]
fn childhood_and_elder_actions_follow_life_stage() {
    let mut sim = Simulation::new(14);
    let idx = 0;
    sim.organisms[idx].age = 0;
    assert!(actions_for(&sim, idx)
        .iter()
        .any(|action| (5580..=5629).contains(action)));
    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (5640..=5689).contains(action)));

    sim.organisms[idx].age = sim.organisms[idx].max_age.saturating_mul(4) / 5;
    assert!(!actions_for(&sim, idx)
        .iter()
        .any(|action| (5580..=5629).contains(action)));
    assert!(actions_for(&sim, idx)
        .iter()
        .any(|action| (5640..=5689).contains(action)));
}

#[test]
fn advanced_crafts_do_not_cross_professions_or_skip_prerequisites() {
    let mut sim = Simulation::new(16);
    let org = &mut sim.organisms[0];
    let steel = ACTION_BANDS.iter().find(|band| band.start == 1202).unwrap();
    let bow = ACTION_BANDS.iter().find(|band| band.start == 1211).unwrap();

    org.discoveries.insert("ironworking".to_string());
    org.specialty = Some("weaver".to_string());
    assert!(!qualifies(org, steel.qualification));
    org.specialty = Some("smith".to_string());
    assert!(qualifies(org, steel.qualification));

    org.discoveries.insert("tool_making".to_string());
    org.specialty = Some("carpenter".to_string());
    assert!(!qualifies(org, bow.qualification));
    org.discoveries.insert("weaving".to_string());
    assert!(qualifies(org, bow.qualification));
}

#[test]
fn formal_astronomy_and_cartography_require_era_training_and_context() {
    let mut sim = Simulation::new(0xA570);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Iron);
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("scholar".to_string());
    sim.organisms[idx].literacy = 0.4;
    sim.organisms[idx].discoveries.extend([
        "mathematics".to_string(),
        "writing".to_string(),
        "geometry".to_string(),
    ]);
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.grid.set(x, y, Tile::Grass);
    let mut observatory = Building::new(
        104,
        BuildingKind::Observatory,
        x + 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    observatory.condition = 1.0;
    sim.buildings.push(observatory);

    let actions = actions_for(&sim, idx);
    assert!(actions.contains(&68));
    assert!(actions.contains(&70));

    sim.organisms[idx].specialty = None;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 68, x, y, &spatial).is_none());
    assert!(try_apply(&mut sim, idx, 70, x, y, &spatial).is_none());
}

/// The `436..=455` pre-filter is a coarse `kin_near` superset, but every
/// band in that range lives in `BASE_ACTION_BANDS`, which
/// `available_actions_into` walks separately and adds whenever
/// `band_is_eligible` approves it. So the pre-filter is redundant and the
/// semantic gates are the only real authority — bands 438/451
/// (`SocialGate::None`) and 446/450/454 (`SocialGate::Stranger`) must stay
/// reachable with no kin present. This guards that authority so a future
/// "optimisation" of the pre-filter cannot quietly make them unreachable.
#[test]
fn stranger_gated_actions_in_the_436_range_are_reachable_without_kin() {
    const STRANGER_GATED: usize = 446; // Medieval, Stranger, Water, officer/sailor

    let mut sim = Simulation::new(0xB0A7);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.lineage_eras.insert(lineage.clone(), Era::Medieval);

    // Adult, wealthy enough to qualify, with the two discoveries band 446
    // requires. `move_other_organisms_far_away` clears the default roster
    // so the only neighbour is the one this test places.
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].specialty = Some("officer".to_string());
    sim.organisms[idx].literacy = 1.0;
    sim.organisms[idx]
        .discoveries
        .extend(["warfare", "navigation"].into_iter().map(str::to_string));

    let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
    sim.grid.set(x, y, Tile::Grass);
    sim.grid.set(x, y + 1, Tile::Water); // PlaceGate::Water
    move_other_organisms_far_away(&mut sim, idx);

    // Nobody nearby: the Stranger gate must genuinely block it.
    assert!(
        !actions_for(&sim, idx).contains(&STRANGER_GATED),
        "action {STRANGER_GATED} must need a stranger nearby"
    );

    // A stranger, and no kin.
    sim.organisms[1].lineage_id = "lineage-stranger".to_string();
    sim.organisms[1].alive = true;
    sim.organisms[1].x = x as f32 + 1.0;
    sim.organisms[1].y = y as f32;
    assert!(
        actions_for(&sim, idx).contains(&STRANGER_GATED),
        "action {STRANGER_GATED} is gated on SocialGate::Stranger and must be \
         offered when a stranger is near, even with no kin present"
    );
}

#[test]
fn pre_stone_cannot_bypass_advanced_build_farming_or_siege_gates() {
    let mut sim = Simulation::new(0xA11CE);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
    sim.organisms[idx].literacy = 1.0;
    sim.organisms[idx].is_leader = true;
    sim.organisms[idx].inv_food = 10;
    sim.organisms[idx].inv_wood = 10;
    sim.organisms[idx].inv_stone = 10;
    sim.organisms[idx].wealth = 10;
    sim.organisms[idx].discoveries.extend(
        [
            "foraging",
            "barter",
            "currency",
            "writing",
            "chronicle",
            "mathematics",
            "astronomy",
            "engineering",
            "irrigation",
            "agriculture",
            "ironworking",
            "law_code",
        ]
        .into_iter()
        .map(str::to_string),
    );
    let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    sim.organisms[1].lineage_id = lineage.clone();
    sim.organisms[1].x = x as f32 + 1.0;
    sim.organisms[1].y = y as f32;
    sim.grid.set(x, y, Tile::Grass);
    sim.grid.set(x + 1, y, Tile::Rock);
    sim.grid.set(x, y + 1, Tile::Water);
    let mut barracks = Building::new(
        500,
        BuildingKind::Barracks,
        x - 1,
        y,
        Some(lineage),
        sim.tick_count,
    );
    barracks.condition = 1.0;
    sim.buildings.push(barracks);

    sim.organisms[idx].specialty = Some("builder".to_string());
    assert!(
        actions_for(&sim, idx).contains(&49),
        "the resource-gated first hut must remain an early-game action"
    );
    sim.organisms[idx].inv_wood = 0;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    assert!(try_apply(&mut sim, idx, 49, x, y, &spatial).is_none());
    sim.organisms[idx].inv_wood = 10;

    for (action, specialty) in [
        (167, "engineer"),
        (172, "merchant"),
        (174, "scholar"),
        (175, "scholar"),
        (278, "merchant"),
        (297, "politician"),
        (353, "farmer"),
        (438, "engineer"),
    ] {
        sim.organisms[idx].specialty = Some(specialty.to_string());
        assert!(
            !actions_for(&sim, idx).contains(&action),
            "pre-stone action {action} leaked through broad selection"
        );
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(
            try_apply(&mut sim, idx, action, x, y, &spatial).is_none(),
            "pre-stone action {action} bypassed apply-time validation"
        );
    }
}
