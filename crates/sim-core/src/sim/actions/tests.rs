use super::*;
use crate::sim::spatial::SpatialIndex;
use crate::sim::tech::buildings::Building;

fn actions_for(sim: &Simulation, idx: usize) -> Vec<usize> {
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let organism = &sim.organisms[idx];
    available_actions(sim, idx, organism.x as i32, organism.y as i32, &spatial)
}

fn move_other_organisms_far_away(sim: &mut Simulation, idx: usize) {
    for (other_index, organism) in sim.organisms.iter_mut().enumerate() {
        if other_index == idx {
            continue;
        }
        organism.x = 300.0 + (other_index % 10) as f32 * 10.0;
        organism.y = 300.0 + (other_index / 10) as f32 * 10.0;
    }
}

#[test]
fn local_place_cache_matches_building_checks_and_refreshes_after_world_changes() {
    let mut sim = Simulation::new(0xcace);
    let lineage = sim.organisms[0].lineage_id.clone();
    let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
    sim.buildings.clear();

    for (id, kind, dx, owner, condition, decorative) in [
        (1, BuildingKind::Market, 1, Some(lineage.clone()), 1.0, false),
        (2, BuildingKind::Library, 7, None, 1.0, false),
        (3, BuildingKind::Hut, 2, Some(lineage.clone()), 1.0, false),
        (4, BuildingKind::Hospital, 3, Some("other".into()), 1.0, false),
        (5, BuildingKind::Forge, 4, Some(lineage.clone()), 0.5, false),
        (6, BuildingKind::Cafe, 2, Some(lineage.clone()), 1.0, true),
    ] {
        let mut building = Building::new(id, kind, x + dx, y, owner, 0);
        building.condition = condition;
        building.decorative = decorative;
        sim.buildings.push(building);
    }

    let workspaces = [
        Workspace::Any,
        Workspace::Education,
        Workspace::Trade,
        Workspace::Industry,
        Workspace::Worship,
        Workspace::Civic,
        Workspace::Military,
        Workspace::Transport,
        Workspace::Healthcare,
        Workspace::Recreation,
        Workspace::Research,
        Workspace::Cafe,
        Workspace::Fashion,
        Workspace::Butchery,
        Workspace::Brewery,
        Workspace::Workshop,
        Workspace::Forge,
        Workspace::Textile,
        Workspace::Arts,
        Workspace::Writing,
        Workspace::Craft,
        Workspace::Jewelry,
        Workspace::Technical,
        Workspace::Postal,
    ];
    assert_eq!(workspaces.len(), WORKSPACE_KIND_COUNT);
    for (index, &workspace) in workspaces.iter().enumerate() {
        assert_eq!(workspace as usize, index);
    }
    for (query_x, query_y, query_lineage) in [
        (x, y, lineage.as_str()),
        (x + 35, y + 35, lineage.as_str()),
        (x, y, "other"),
    ] {
        let mut cache = LocalPlaceCache::new();
        for workspace in workspaces {
            let expected = near_complete_workspace(&sim, query_lineage, query_x, query_y, workspace);
            assert_eq!(
                cache.workspace(&sim, query_lineage, query_x, query_y, workspace),
                expected
            );
            assert_eq!(
                cache.workspace(&sim, query_lineage, query_x, query_y, workspace),
                expected
            );
        }
        assert_eq!(
            cache.hut(&sim, query_lineage, query_x, query_y),
            near_hut(&sim, query_lineage, query_x, query_y)
        );
    }

    sim.buildings.clear();
    let mut market = Building::new(7, BuildingKind::Market, x + 1, y, Some(lineage.clone()), 0);
    market.condition = 1.0;
    sim.buildings.push(market);
    assert!(LocalPlaceCache::new().workspace(&sim, &lineage, x, y, Workspace::Trade));
    sim.buildings[0].damage = 1.0;
    assert!(!LocalPlaceCache::new().workspace(&sim, &lineage, x, y, Workspace::Trade));

    let (remote_x, remote_y) = (x + 35, y + 35);
    for dx in -1..=1 {
        for dy in -1..=1 {
            sim.grid.set(remote_x + dx, remote_y + dy, Tile::Grass);
        }
    }
    let mut old_cache = LocalPlaceCache::new();
    assert!(!old_cache.hut(&sim, &lineage, remote_x, remote_y));
    sim.grid.set(remote_x, remote_y, Tile::Hut);
    assert!(!old_cache.hut(&sim, &lineage, remote_x, remote_y));
    assert!(LocalPlaceCache::new().hut(&sim, &lineage, remote_x, remote_y));
}

#[test]
fn reused_action_buffers_match_fresh_results_across_context_changes() {
    let mut sim = Simulation::new(0xa110);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    let mut actions = Vec::new();
    let mut nearby = Vec::new();

    for (phase, era, tile) in [
        (0, Era::PreStone, Tile::Grass),
        (30, Era::Stone, Tile::Water),
        (60, Era::Modern, Tile::Rock),
        (90, Era::Information, Tile::Food),
    ] {
        sim.tick_count = phase;
        sim.lineage_eras.insert(lineage.clone(), era);
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x, y, tile);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let expected = available_actions(&sim, idx, x, y, &spatial);

        actions.push(usize::MAX);
        nearby.push(usize::MAX);
        available_actions_into(&sim, idx, x, y, &spatial, &mut actions, &mut nearby);
        assert_eq!(actions, expected, "action order changed at phase {phase}");
        assert!(!nearby.contains(&usize::MAX));
    }
}

#[test]
fn semantic_validation_lookup_matches_band_tables() {
    let legacy = |action: usize| {
        action >= 540
            || BASE_ACTION_BANDS
                .iter()
                .any(|band| (band.start..=band.end).contains(&action))
    };
    for action in (0..=u16::MAX as usize).chain([usize::MAX]) {
        assert_eq!(
            action_requires_semantic_validation(action),
            legacy(action),
            "lookup diverges from band tables at action {action}"
        );
    }
}

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
fn rotating_family_sample_stays_bounded_and_eventually_exposes_every_action() {
    let candidates: Vec<usize> = (1200..=1249).collect();
    let mut seen = rustc_hash::FxHashSet::default();
    for phase in 0..candidates.len() {
        let mut actions = Vec::new();
        extend_rotating_candidates(&mut actions, &candidates, phase);
        assert_eq!(actions.len(), ACTIONS_PER_BAND);
        seen.extend(actions);
    }
    assert_eq!(seen.len(), candidates.len());
}

#[test]
fn compact_family_masks_preserve_sorted_unique_rotation() {
    for stride in [1, 3, 7] {
        let mut families = [0u64; ACTION_FAMILY_COUNT];
        let mut reference = std::collections::BTreeMap::<usize, Vec<usize>>::new();
        for (index, band) in ACTION_BANDS.iter().enumerate() {
            if index % stride != 0 {
                continue;
            }
            mark_eligible_family_band(&mut families, band.start, band.end);
            reference
                .entry(band.start / ACTION_FAMILY_WIDTH)
                .or_default()
                .extend(band.start..=band.end);
        }
        for candidates in reference.values_mut() {
            candidates.sort_unstable();
            candidates.dedup();
        }
        for phase in [0, 1, 17, 59, 101, 4095] {
            let mut expected = Vec::new();
            for candidates in reference.values() {
                extend_rotating_candidates(&mut expected, candidates, phase);
            }
            let mut actual = Vec::new();
            extend_rotating_family_masks(&mut actual, &families, phase);
            assert_eq!(actual, expected, "stride {stride}, phase {phase}");
        }
    }
}

#[test]
fn qualification_requires_every_active_dimension() {
    let mut sim = Simulation::new(15);
    let org = &mut sim.organisms[0];
    let requirement = qualification(&["electricity"], &["engineer"], 0.5);

    org.discoveries.insert("electricity".to_string());
    assert!(!qualifies(org, requirement));
    org.specialty = Some("engineer".to_string());
    assert!(!qualifies(org, requirement));
    org.literacy = 0.5;
    assert!(qualifies(org, requirement));

    let alternative = qualification_any(&["electricity"], &["engineer"], 0.5);
    org.specialty = None;
    org.literacy = 0.0;
    assert!(qualifies(org, alternative));
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
fn semantic_base_ranges_have_exactly_one_requirement_for_every_action() {
    for action in [67, 68, 70]
        .into_iter()
        .chain(39..=50)
        .chain(166..=180)
        .chain(276..=315)
        .chain(336..=355)
        .chain(386..=435)
        .chain(436..=455)
        .chain(456..=485)
        .chain(501..=520)
        .chain(536..=537)
    {
        let matches = BASE_ACTION_BANDS
            .iter()
            .filter(|band| (band.start..=band.end).contains(&action))
            .count();
        assert_eq!(matches, 1, "action {action} must have one semantic gate");
    }

    for action in 540..=589 {
        let matches = ACTION_BANDS
            .iter()
            .filter(|band| (band.start..=band.end).contains(&action))
            .count();
        assert_eq!(matches, 1, "domestic action {action} must have one semantic gate");
    }
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

/// `CONTEXT_CHECKED` lets the candidate filter skip the per-module checks for
/// most ids. This holds it to that promise on a world that has been lived in.
#[test]
fn ids_without_a_context_check_pass_every_context_check() {
    let mut sim = Simulation::new(0xc0de);
    for round in 0..4 {
        for _ in 0..150 {
            sim.tick();
        }
        for idx in 0..sim.organisms.len() {
            let org = &sim.organisms[idx];
            if !org.alive {
                continue;
            }
            let (ix, iy) = (org.x as i32, org.y as i32);
            for action in (0..crate::organism::organism::ACTION_ID_SPACE)
                .filter(|a| !super::available::CONTEXT_CHECKED[*a])
            {
                assert!(
                    !action_output_at_capacity(org, action),
                    "capacity, action {action}"
                );
                assert!(
                    agriculture::action_is_possible(&sim, idx, action, ix, iy, true)
                        && agriculture::action_is_possible(&sim, idx, action, ix, iy, false),
                    "agriculture, action {action}, round {round}"
                );
                assert!(
                    religion_expanded::action_is_possible(&sim, idx, action, &[], sim.tick_count),
                    "religion, action {action}, round {round}"
                );
                assert!(
                    relationships_deep::action_is_possible(&sim, idx, action, &[]),
                    "relationships, action {action}, round {round}"
                );
                assert!(
                    crate::sim::civ::trade_routes::action_is_possible(&sim, idx, action, &[]),
                    "trade routes, action {action}, round {round}"
                );
            }
        }
    }
}

/// The mask-based band gate must open and close exactly where the original
/// gate-by-gate check did, for organisms in every kind of situation.
#[test]
fn band_gate_masks_agree_with_the_gate_by_gate_check() {
    use crate::sim::civ::progress::eras::LADDER;
    let mut sim = Simulation::new(0xba5e);
    let mut state = 0x9e37_79b9_7f4a_7c15u64;
    let mut next = move |modulus: u64| {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state % modulus
    };
    let mut compared = 0usize;
    let mut open = 0usize;
    for round in 0..6 {
        for _ in 0..200 {
            sim.tick();
        }
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        for idx in 0..sim.organisms.len().min(40) {
            if !sim.organisms[idx].alive {
                continue;
            }
            for variation in 0..6 {
                {
                    let org = &mut sim.organisms[idx];
                    if variation > 0 {
                        org.inv_food = next(3) as u8;
                        org.inv_wood = next(3) as u8;
                        org.inv_stone = next(3) as u8;
                        org.wealth = next(2) as u32 * next(50) as u32;
                        org.is_leader = next(4) == 0;
                        org.literacy = next(101) as f32 / 100.0;
                        org.x = (next(560) + 20) as f32;
                        org.y = (next(260) + 20) as f32;
                        org.home_x = org.x + (next(30) as f32 - 15.0);
                        org.home_y = org.y + (next(30) as f32 - 15.0);
                    }
                }
                let lineage = sim.organisms[idx].lineage_id.clone();
                sim.lineage_eras
                    .insert(lineage.clone(), LADDER[next(LADDER.len() as u64) as usize]);
                let (ix, iy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
                let mut nearby = Vec::new();
                let context = EligibilityContext::gather(&sim, idx, ix, iy, &spatial, &mut nearby);
                let bits = ctx_bits(&sim, idx, ix, iy, &context);
                let era = sim.era(&lineage);
                let tables = resolved::tables();
                let gate = tables.org_gate(&sim.organisms[idx]);
                let mut fast_cache = LocalPlaceCache::new();
                let mut reference_cache = LocalPlaceCache::new();
                for band in tables.base.iter().chain(&tables.banded).chain(&tables.registered) {
                    let fast =
                        band_is_eligible(&sim, ix, iy, band, era, bits, &gate, &mut fast_cache, &lineage);
                    let reference = band_is_eligible_reference(
                        &sim,
                        idx,
                        ix,
                        iy,
                        band,
                        era,
                        context,
                        &gate,
                        &mut reference_cache,
                    );
                    assert_eq!(
                        fast, reference,
                        "round {round}, organism {idx}, variation {variation}, band {}..={}",
                        band.band.start, band.band.end
                    );
                    compared += 1;
                    open += usize::from(fast);
                }
            }
        }
    }
    assert!(
        compared > 50_000 && open > 1_000,
        "compared {compared}, open {open}"
    );
}
