//! Saving and loading.

use super::*;

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

/// The save is streamed into the file; the bytes must equal what building the
/// whole document in memory (the previous implementation) produced, on a world
/// that has run long enough to have vocabularies, memories and trails.
#[test]
fn streamed_save_matches_the_in_memory_document() {
    let mut sim = Simulation::new(23);
    for _ in 0..600 {
        sim.tick();
    }
    let state = sim.to_save_state();
    let expected = serde_json::to_string(&state).unwrap();

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-stream-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let tmp_s = format!("{}.tmp", path_s);
    crate::sim::persistence::write_save_to_disk(&state, &path_s).unwrap();
    let written = std::fs::read(&path_s).unwrap();
    assert!(written.len() > 100_000, "the world should produce a real save");
    assert!(
        written == expected.as_bytes(),
        "streamed save differs from the in-memory one"
    );
    assert!(!std::path::Path::new(&tmp_s).exists());
    let _ = std::fs::remove_file(&path_s);

    // A destination that cannot be created is an error and leaves nothing behind.
    let mut missing = std::env::temp_dir();
    missing.push(format!("thehumanbox-no-such-dir-{}", std::process::id()));
    missing.push("world.save");
    assert!(crate::sim::persistence::write_save_to_disk(&state, &missing.to_string_lossy()).is_err());
    assert!(!missing.exists());
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
    sim.lineage_elders
        .insert("lineage-a".to_string(), "elder-a".to_string());

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
    assert_eq!(
        loaded.lineage_elders.get("lineage-a"),
        Some(&"elder-a".to_string())
    );
    assert_eq!(loaded.rng.random::<u64>(), expected_next);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(&tmp_s);
}

#[test]
fn save_load_preserves_experiment_evidence() {
    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-cooldown-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    let mut sim = Simulation::new(42);
    sim.tick_count = 50_000;
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].last_experiment_tick = 3_000;
    let org_id = sim.organisms[idx].id.clone();

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(999, &path_s);

    let loaded_org = loaded.organisms.iter().find(|o| o.id == org_id).unwrap();
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
    assert!(loaded_org.is_leader);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}
