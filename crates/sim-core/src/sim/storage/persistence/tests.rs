use super::*;

#[test]
fn learning_trace_round_trips_and_old_saves_default_to_empty() {
    let mut saved: organism::OrgSave = serde_json::from_str("{}").unwrap();
    assert!(saved.learning_trace.is_empty());
    saved.learning_trace.push(("state".into(), 17));
    let encoded = serde_json::to_string(&saved).unwrap();
    let decoded: organism::OrgSave = serde_json::from_str(&encoded).unwrap();
    let loaded = organism::org_from_save(decoded, 0);
    let round_trip = organism::org_to_save(&loaded);
    assert_eq!(round_trip.learning_trace, vec![("state".into(), 17)]);
}

fn saved_battle(id: &str) -> crate::sim::warfare::Battle {
    crate::sim::warfare::Battle {
        id: id.to_string(),
        attackers: Vec::new(),
        defenders: Vec::new(),
        attacker_orgs: Vec::new(),
        defender_orgs: Vec::new(),
        scale: crate::sim::warfare::BattleScale::Skirmish,
        location: (10, 10),
        started_tick: 1,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 0,
        initial_d: 0,
    }
}

#[test]
fn empty_save_json_loads_as_default_state() {
    let parsed: SaveState = serde_json::from_str("{}")
        .expect("empty {} JSON must deserialize - did a Save struct lose its serde(default)?");
    assert_eq!(parsed.tick_count, 0);
    assert!(parsed.organisms.is_empty());
    assert!(parsed.animals.is_empty());
    assert!(parsed.grid.tiles.is_empty());
    assert_eq!(parsed.weather.wind_x, 0.4);

    let mut path = std::env::temp_dir();
    path.push(format!("thehumanbox-empty-save-test-{}.json", std::process::id()));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    std::fs::write(&path_s, "{}").unwrap();
    let _sim = Simulation::load_or_new(7, &path_s);
    let _ = std::fs::remove_file(&path_s);
}

#[test]
fn invalid_utf8_save_is_backed_up_before_starting_fresh() {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-invalid-utf8-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    std::fs::write(&path_s, [b'{', 0xff, b'}']).unwrap();

    let _sim = Simulation::load_or_new(7, &path_s);

    assert!(!std::path::Path::new(&path_s).exists());
    let parent = path.parent().unwrap();
    let file_name = path.file_name().unwrap().to_string_lossy();
    let backup = std::fs::read_dir(parent)
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|candidate| {
            candidate.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .starts_with(&format!("{file_name}.corrupt-"))
            })
        })
        .expect("invalid UTF-8 save should be preserved as a corrupt backup");
    assert_eq!(std::fs::read(&backup).unwrap(), [b'{', 0xff, b'}']);
    let _ = std::fs::remove_file(backup);
}

#[cfg(unix)]
#[test]
fn unreadable_save_path_is_backed_up_before_starting_fresh() {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-unreadable-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir(&path).unwrap();

    let _sim = Simulation::load_or_new(7, &path_s);

    assert!(!path.exists());
    let parent = path.parent().unwrap();
    let file_name = path.file_name().unwrap().to_string_lossy();
    let backup = std::fs::read_dir(parent)
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|candidate| {
            candidate.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .starts_with(&format!("{file_name}.unreadable-"))
            })
        })
        .expect("unreadable save path should be preserved as a backup");
    assert!(backup.is_dir());
    std::fs::remove_dir_all(backup).unwrap();
}

#[test]
fn mutable_depth_wind_and_operational_infrastructure_survive_reload() {
    use crate::sim::buildings::{Building, BuildingKind};

    let seed = 0x5A7E_10AD;
    let mut sim = Simulation::new(seed);
    let (water_x, water_y) = (100, 100);
    let water_index = WorldGrid::idx(water_x, water_y);
    sim.grid.set(water_x, water_y, Tile::Water);
    sim.grid.depth[water_index] = 0.73;
    sim.weather.wind_x = -0.31;
    sim.weather.wind_y = 0.62;
    sim.weather.wind_last_tick = 1_234;

    // Simulate an imported legacy world whose completed well has lost its
    // one-time terrain effect. Loading must repair it without completing
    // unfinished projects.
    let (well_x, well_y) = (110, 110);
    sim.grid.set(well_x, well_y, Tile::Grass);
    let mut completed_well = Building::new(
        90_001,
        BuildingKind::Well,
        well_x,
        well_y,
        Some("lineage-a".into()),
        10,
    );
    completed_well.condition = 1.0;
    sim.buildings.push(completed_well);
    let mut unfinished_well = Building::new(
        90_002,
        BuildingKind::Well,
        well_x + 2,
        well_y,
        Some("lineage-a".into()),
        10,
    );
    unfinished_well.condition = 0.99;
    sim.grid.set(well_x + 2, well_y, Tile::Grass);
    sim.buildings.push(unfinished_well);

    let loaded = Simulation::from_save(seed, sim.to_save_state());

    assert_eq!(loaded.grid.get(water_x, water_y), Tile::Water);
    assert!((loaded.grid.depth_at(water_x, water_y) - 0.73).abs() < f32::EPSILON);
    assert!((loaded.weather.wind_x - (-0.31)).abs() < f32::EPSILON);
    assert!((loaded.weather.wind_y - 0.62).abs() < f32::EPSILON);
    assert_eq!(loaded.weather.wind_last_tick, 1_234);
    assert_eq!(loaded.grid.get(well_x, well_y), Tile::Water);
    assert_eq!(loaded.grid.depth_at(well_x, well_y), 0.0);
    assert_eq!(loaded.grid.get(well_x + 2, well_y), Tile::Grass);
}

#[test]
fn building_damage_round_trips_through_schema_v5() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(0xB01D);
    sim.buildings.clear();
    let mut building = Building::new(77, BuildingKind::House, 31, 32, Some("lineage-a".into()), 10);
    building.condition = 1.0;
    building.damage = 0.82;
    building.ruined_at_tick = Some(90);
    building.last_damage_tick = Some(91);
    building.last_repair_tick = Some(92);
    sim.buildings.push(building);

    let state = sim.to_save_state();
    assert_eq!(state.version, SAVE_SCHEMA_VERSION);
    let encoded = serde_json::to_string(&state).expect("serialize save state");
    let decoded: SaveState = serde_json::from_str(&encoded).expect("deserialize save state");
    let loaded = Simulation::from_save(sim.world_seed, decoded);
    let building = loaded.buildings.first().expect("persisted building");

    assert!((building.damage_fraction() - 0.82).abs() < 0.000_001);
    assert_eq!(building.ruined_at_tick, Some(90));
    assert_eq!(building.last_damage_tick, Some(91));
    assert_eq!(building.last_repair_tick, Some(92));
    assert!(building.is_ruined());
    assert_eq!(loaded.building_state_revision, 1);
    assert_eq!(loaded.serialized_building_state_revision, 0);
}

#[test]
fn loading_latches_timestamp_less_full_damage_as_a_ruin() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut state = SaveState {
        version: SAVE_SCHEMA_VERSION,
        tick_count: 321,
        ..SaveState::default()
    };
    let mut building = Building::new(78, BuildingKind::Factory, 20, 20, None, 10);
    building.condition = 1.0;
    building.damage = 1.0;
    state.buildings.push(building);

    let loaded = Simulation::from_save(7, state);
    assert_eq!(loaded.buildings[0].ruined_at_tick, Some(321));
    assert!(loaded.buildings[0].is_ruined());
}

#[test]
fn loading_renumbers_duplicate_building_ids() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut state = SaveState {
        version: SAVE_SCHEMA_VERSION,
        next_building_id: 1,
        ..SaveState::default()
    };
    for (id, kind) in [
        (7, BuildingKind::Hut),
        (7, BuildingKind::Granary),
        (9, BuildingKind::House),
    ] {
        let mut building = Building::new(id, kind, 10, 10, None, 1);
        building.condition = 1.0;
        state.buildings.push(building);
    }

    let loaded = Simulation::from_save(7, state);

    let ids: Vec<u32> = loaded.buildings.iter().map(|b| b.id).collect();
    assert_eq!(ids[0], 7, "the first id is kept");
    assert_eq!(ids[2], 9, "a distinct id is kept");
    assert_eq!(ids[1], 10, "the repeat is moved above every id the save held");
    assert_eq!(loaded.buildings[1].kind, BuildingKind::Granary);
    let mut unique = ids.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), ids.len(), "every loaded building has its own id");
    assert_eq!(
        loaded.next_building_id, 11,
        "the counter is left clear of the repaired ids"
    );
}

#[test]
fn legacy_default_counters_advance_past_all_persisted_ids() {
    use crate::sim::agriculture::{CropKind, Farm};
    use crate::sim::buildings::{Building, BuildingKind};
    use crate::sim::culture::{ArtKind, Artwork, Festival, FestivalKind, Religion, ReligionKind};
    use crate::sim::language_tech::{Book, BookTopic};
    use crate::sim::transportation::{TransportKind, Vehicle};

    let mut state = SaveState::default();
    state.animals.push(AnimalSave {
        id: 41,
        ..AnimalSave::default()
    });
    state
        .buildings
        .push(Building::new(51, BuildingKind::Hut, 10, 10, None, 1));
    state.religions.push(Religion {
        id: "rel61".to_string(),
        kind: ReligionKind::Animism,
        name: "Old Path".to_string(),
        founded_tick: 1,
        founder_lineage: "lineage-a".to_string(),
        adherents: 2,
        last_milestone: None,
    });
    state.artworks.push(Artwork {
        id: 71,
        kind: ArtKind::CavePainting,
        creator_id: "artist-a".to_string(),
        creator_name: "Artist".to_string(),
        location: [10, 10],
        tick: 1,
        title: "First Mark".to_string(),
    });
    state.festivals.push(Festival {
        id: 81,
        lineage_id: "lineage-a".to_string(),
        name: "First Feast".to_string(),
        kind: FestivalKind::Harvest,
        start_tick: 1,
        duration_ticks: 10,
        center: [10, 10],
    });
    state.books.push(Book {
        id: 91,
        title: "Old Words".to_string(),
        author_org_id: "author-a".to_string(),
        author_name: "Author".to_string(),
        written_tick: 1,
        lineage_id: "lineage-a".to_string(),
        topic: BookTopic::History,
        copies: 1,
    });
    state.farms.push(Farm {
        id: 101,
        x: 10,
        y: 10,
        owner_lineage: "lineage-a".to_string(),
        crop: CropKind::Wheat,
        planted_tick: 1,
        ready_tick: 100,
        harvested: false,
        prepared: false,
        season_timed: false,
        withered: false,
    });
    state.vehicles.push(Vehicle {
        id: 111,
        kind: TransportKind::Cart,
        owner_lineage: "lineage-a".to_string(),
        x: 10,
        y: 10,
        occupants: Vec::new(),
        cargo: 0,
        route: Vec::new(),
        ready_tick: 0,
        harbour: None,
        bound_for: None,
        ferry: None,
        rail_line: None,
    });
    state.battles.push(saved_battle("legacy-battle-a"));
    state.battles.push(saved_battle("legacy-battle-b"));

    let loaded = Simulation::from_save(7, state);

    assert_eq!(loaded.next_animal_id, 42);
    assert_eq!(loaded.next_building_id, 52);
    assert_eq!(loaded.next_religion_id, 62);
    assert_eq!(loaded.next_artwork_id, 72);
    assert_eq!(loaded.next_festival_id, 82);
    assert_eq!(loaded.next_book_id, 92);
    assert_eq!(loaded.next_farm_id, 102);
    assert_eq!(loaded.next_vehicle_id, 112);
    assert_eq!(loaded.next_battle_id, 3);
}

#[test]
fn loading_repairs_dangling_religions_and_exact_live_adherent_counts() {
    use crate::sim::culture::{Religion, ReligionKind};

    let mut state = SaveState {
        version: SAVE_SCHEMA_VERSION,
        ..SaveState::default()
    };
    state.religions.extend([
        Religion {
            id: "rel7".to_string(),
            kind: ReligionKind::Animism,
            name: "Living Path".to_string(),
            founded_tick: 1,
            founder_lineage: "lineage-a".to_string(),
            adherents: 99,
            last_milestone: None,
        },
        Religion {
            id: "rel8".to_string(),
            kind: ReligionKind::Animism,
            name: "Empty Path".to_string(),
            founded_tick: 2,
            founder_lineage: "lineage-b".to_string(),
            adherents: 42,
            last_milestone: None,
        },
        Religion {
            id: "rel7".to_string(),
            kind: ReligionKind::Secular,
            name: "Duplicate Later Path".to_string(),
            founded_tick: 9,
            founder_lineage: "lineage-c".to_string(),
            adherents: 500,
            last_milestone: None,
        },
    ]);
    state.organisms.extend([
        OrgSave {
            id: "valid-alive".to_string(),
            name: "Valid Alive".to_string(),
            x: 20.0,
            y: 20.0,
            alive: true,
            lineage_id: "lineage-a".to_string(),
            max_age: 20_000,
            piety: 0.8,
            religion_id: Some("rel7".to_string()),
            ..OrgSave::default()
        },
        OrgSave {
            id: "valid-dead".to_string(),
            name: "Valid Dead".to_string(),
            x: 21.0,
            y: 20.0,
            alive: false,
            lineage_id: "lineage-a".to_string(),
            max_age: 20_000,
            piety: 0.7,
            religion_id: Some("rel7".to_string()),
            ..OrgSave::default()
        },
        OrgSave {
            id: "dangling-alive".to_string(),
            name: "Dangling Alive".to_string(),
            x: 22.0,
            y: 20.0,
            alive: true,
            lineage_id: "lineage-c".to_string(),
            max_age: 20_000,
            piety: 0.9,
            religion_id: Some("rel-missing".to_string()),
            ..OrgSave::default()
        },
    ]);

    let loaded = Simulation::from_save(7, state);
    let valid_alive = loaded
        .organisms
        .iter()
        .find(|organism| organism.id == "valid-alive")
        .unwrap();
    let valid_dead = loaded
        .organisms
        .iter()
        .find(|organism| organism.id == "valid-dead")
        .unwrap();
    let dangling = loaded
        .organisms
        .iter()
        .find(|organism| organism.id == "dangling-alive")
        .unwrap();

    assert_eq!(valid_alive.religion_id.as_deref(), Some("rel7"));
    assert_eq!(valid_alive.piety, 0.8);
    assert_eq!(valid_dead.religion_id.as_deref(), Some("rel7"));
    assert_eq!(valid_dead.piety, 0.7);
    assert_eq!(dangling.religion_id, None);
    assert_eq!(dangling.piety, 0.0);
    assert_eq!(loaded.religions.len(), 2);
    assert_eq!(loaded.religions[0].id, "rel7");
    assert_eq!(loaded.religions[0].name, "Living Path");
    assert_eq!(loaded.religions[0].adherents, 1);
    assert_eq!(loaded.religions[1].adherents, 0);
    assert_eq!(loaded.next_religion_id, 9);
}

#[test]
fn loading_consolidates_treaties_to_one_active_record_per_pair() {
    use crate::sim::warfare::{Treaty, TreatyKind};

    let mut state = SaveState {
        tick_count: 50,
        ..SaveState::default()
    };
    state.treaties.extend([
        Treaty {
            lineage_a: "river".into(),
            lineage_b: "hill".into(),
            kind: TreatyKind::NonAggression,
            signed_tick: 10,
            expires_tick: 100,
        },
        Treaty {
            lineage_a: "hill".into(),
            lineage_b: "river".into(),
            kind: TreatyKind::Trade,
            signed_tick: 20,
            expires_tick: 200,
        },
        Treaty {
            lineage_a: "river".into(),
            lineage_b: "hill".into(),
            kind: TreatyKind::Alliance,
            signed_tick: 1,
            expires_tick: 40,
        },
        Treaty {
            lineage_a: "same".into(),
            lineage_b: "same".into(),
            kind: TreatyKind::Alliance,
            signed_tick: 20,
            expires_tick: 200,
        },
    ]);

    let loaded = Simulation::from_save(7, state);

    assert_eq!(loaded.treaties.len(), 1);
    assert_eq!(loaded.treaties[0].lineage_a, "hill");
    assert_eq!(loaded.treaties[0].lineage_b, "river");
    assert_eq!(loaded.treaties[0].kind, TreatyKind::Trade);
    assert_eq!(loaded.treaties[0].signed_tick, 20);
}

#[test]
fn valid_saved_counter_is_never_moved_backwards() {
    assert_eq!(repaired_next_u32_id(500, [1, 20, 99].into_iter()), 500);
    assert_eq!(repaired_next_sequence(500, 12), 500);
    assert_eq!(
        repaired_next_animal_id(
            500,
            &[AnimalSave {
                id: 99,
                ..AnimalSave::default()
            }],
        ),
        500
    );
}

#[test]
fn every_animal_kind_survives_a_save() {
    for kind in AnimalKind::ALL {
        let a = Animal::new(1, 10.0, 10.0, kind);
        assert!(
            animal_from_save(animal_to_save(&a)).kind == kind,
            "{}",
            kind.name()
        );
    }
}

#[test]
fn practice_in_a_trade_survives_a_save() {
    let mut sim = Simulation::new(0x5C11);
    sim.organisms[0].specialty = Some("farmer".into());
    sim.organisms[0].practice.insert("farmer".into(), 0.42);
    let encoded = serde_json::to_string(&sim.to_save_state()).expect("serialize");
    let decoded: SaveState = serde_json::from_str(&encoded).expect("deserialize");
    let loaded = Simulation::from_save(sim.world_seed, decoded);
    assert_eq!(loaded.organisms[0].practice.get("farmer").copied(), Some(0.42));
}

#[test]
fn family_names_survive_a_save_and_old_saves_derive_one() {
    use crate::organism::organism::surname_for_id;
    let mut sim = Simulation::new(0xFA11);
    sim.organisms[0].surname = "Osuri".into();
    let state = sim.to_save_state();
    let encoded = serde_json::to_string(&state).expect("serialize save state");
    let decoded: SaveState = serde_json::from_str(&encoded).expect("deserialize save state");
    let loaded = Simulation::from_save(sim.world_seed, decoded);
    assert_eq!(loaded.organisms[0].surname, "Osuri");

    // A save written before surnames existed has no such field: the person
    // still gets a family name, derived from their id.
    let mut value: serde_json::Value = serde_json::from_str(&encoded).expect("json");
    for o in value["organisms"].as_array_mut().expect("organisms") {
        o.as_object_mut().expect("organism").remove("surname");
    }
    let old: SaveState = serde_json::from_value(value).expect("old save");
    let loaded = Simulation::from_save(sim.world_seed, old);
    assert!(loaded.organisms[0].surname.is_empty());
    assert_eq!(
        loaded.organisms[0].family_name(),
        surname_for_id(&loaded.organisms[0].id)
    );
}

#[test]
fn generations_reached_survive_a_save() {
    let mut sim = Simulation::new(0x6E7);
    sim.lineage_generations_reached.insert("lin-a".into(), 5);
    let encoded = serde_json::to_string(&sim.to_save_state()).expect("serialize");
    let decoded: SaveState = serde_json::from_str(&encoded).expect("deserialize");
    let loaded = Simulation::from_save(sim.world_seed, decoded);
    assert_eq!(loaded.lineage_generations_reached.get("lin-a"), Some(&5));
}

#[test]
fn a_newborn_animal_keeps_its_birth_tick_through_a_save_and_old_saves_load_as_grown() {
    use crate::organism::animal::{Animal, AnimalKind};
    let mut child = Animal::new(7, 3.0, 4.0, AnimalKind::Deer);
    child.born_tick = 1234;
    let back = super::organism::animal_from_save(super::organism::animal_to_save(&child));
    assert_eq!(back.born_tick, 1234);

    // A save written before this field existed has no born_tick: the animal loads as grown.
    let old: AnimalSave = serde_json::from_str(
        r#"{"id":7,"x":3.0,"y":4.0,"alive":true,"energy":0.5,"kind":0,"last_reproduced":0}"#,
    )
    .unwrap();
    assert_eq!(super::organism::animal_from_save(old).born_tick, 0);
}

#[test]
fn a_strict_load_refuses_a_map_size_it_would_have_to_regrow_and_leaves_the_file() {
    let sim = Simulation::new(9);
    let mut state = sim.to_save_state();
    state.grid.tiles.truncate(1234);
    let dir = std::env::temp_dir().join(format!("thb-strict-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("odd.json");
    std::fs::write(&path, serde_json::to_vec(&state).unwrap()).unwrap();
    let err = Simulation::load_strict(9, path.to_str().unwrap())
        .err()
        .expect("an odd map is refused");
    assert!(err.contains("1234 cells"), "{err}");
    assert!(path.exists(), "the file stays where it was");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_strict_load_reads_a_world_this_build_saved() {
    let mut sim = Simulation::new(9);
    sim.tick_n(5);
    let dir = std::env::temp_dir().join(format!("thb-strict-ok-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("ok.json");
    sim.save_result(path.to_str().unwrap()).unwrap();
    let loaded = Simulation::load_strict(9, path.to_str().unwrap()).expect("its own save loads");
    assert_eq!(loaded.tick_count, 5);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn load_or_new_backs_up_a_save_whose_map_size_it_does_not_know() {
    let mut sim = Simulation::new(9);
    sim.tick_n(3);
    let mut state = sim.to_save_state();
    state.grid.tiles.truncate(1234);
    let bytes = serde_json::to_vec(&state).unwrap();
    let dir = std::env::temp_dir().join(format!("thb-grid-mismatch-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("odd.json");
    std::fs::write(&path, &bytes).unwrap();

    let fresh = Simulation::load_or_new(9, path.to_str().unwrap());

    assert_eq!(
        fresh.tick_count, 0,
        "a fresh world, not the saved people on regrown terrain"
    );
    assert!(
        !path.exists(),
        "the original is moved aside so the next save cannot overwrite it"
    );
    let backup = std::fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("odd.json.grid-mismatch-"))
        })
        .expect("the mismatched save is preserved");
    assert_eq!(std::fs::read(&backup).unwrap(), bytes);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_compact_save_reads_back_as_the_json_save_with_rounded_learning() {
    let mut sim = Simulation::new(7);
    sim.tick_n(900);
    let state = sim.to_save_state();
    let bytes = state.to_bytes();
    assert!(bytes.starts_with(compact::MAGIC));
    let read = SaveState::from_bytes(&bytes).expect("a compact save reads back");
    let mut expected = serde_json::to_value(&state).unwrap();
    for org in expected["organisms"].as_array_mut().unwrap() {
        for row in org["q_table"].as_object_mut().unwrap().values_mut() {
            for entry in row.as_array_mut().unwrap() {
                let value = entry[1].as_f64().unwrap() as f32;
                entry[1] = serde_json::json!(compact::quantize_byte(value));
            }
        }
    }
    assert_eq!(serde_json::to_value(&read).unwrap(), expected);
    let json = serde_json::to_vec(&state).unwrap();
    let from_json = SaveState::from_bytes(&json).expect("a JSON save still reads");
    assert_eq!(
        serde_json::to_value(&from_json).unwrap(),
        serde_json::to_value(&state).unwrap()
    );
}

#[test]
fn a_compact_save_of_a_compact_save_is_the_same_bytes() {
    let mut sim = Simulation::new(11);
    sim.tick_n(600);
    let first = sim.to_save_state().to_bytes();
    let again = SaveState::from_bytes(&first).unwrap().to_bytes();
    assert_eq!(first, again);
}

#[test]
fn a_save_written_a_few_people_at_a_time_is_the_same_bytes() {
    let mut sim = Simulation::new(11);
    sim.tick_n(600);
    let whole = sim.to_save_state().to_bytes();
    assert!(sim.organisms.len() >= 16);
    for step in [1, 7, usize::MAX] {
        let mut writer = sim.to_save_state().into_writer();
        let mut steps = 0;
        while !writer.write(step) {
            steps += 1;
        }
        assert!(step == usize::MAX || steps > 1);
        assert_eq!(writer.finish(), whole);
    }
    let few = Simulation::new_blank(3).to_save_state();
    let expected = few.to_bytes();
    assert_eq!(few.into_writer().finish(), expected);
}

#[test]
fn a_world_keeps_ticking_while_its_save_is_written() {
    let mut sim = Simulation::new(4);
    sim.tick_n(300);
    let whole = sim.to_save_state().to_bytes();
    let mut writer = sim.to_save_state().into_writer();
    while !writer.write(5) {
        sim.tick();
    }
    let bytes = writer.finish();
    assert_eq!(bytes, whole);
    let read = SaveState::from_bytes(&bytes).expect("the stepped save reads back");
    assert_eq!(read.tick_count, 300);
}

#[test]
fn a_first_compact_save_still_reads_with_its_half_float_values() {
    let mut sim = Simulation::new(5);
    sim.tick_n(700);
    let state = sim.to_save_state();
    let bytes = state.to_bytes_v1();
    assert!(bytes.starts_with(compact::MAGIC_V1));
    let read = SaveState::from_bytes(&bytes).expect("a first compact save reads back");
    let mut expected = serde_json::to_value(&state).unwrap();
    for org in expected["organisms"].as_array_mut().unwrap() {
        for row in org["q_table"].as_object_mut().unwrap().values_mut() {
            for entry in row.as_array_mut().unwrap() {
                let value = entry[1].as_f64().unwrap() as f32;
                entry[1] = serde_json::json!(compact::quantize(value));
            }
        }
    }
    assert_eq!(serde_json::to_value(&read).unwrap(), expected);
}

#[test]
fn the_dead_are_saved_without_what_only_the_living_use() {
    let mut sim = Simulation::new(3);
    sim.tick_n(600);
    let dead = sim
        .organisms
        .iter()
        .position(|o| o.alive && !o.q_table.is_empty() && !o.vocabulary.is_empty())
        .expect("someone has learned things");
    sim.organisms[dead].alive = false;
    let saved = organism::org_to_save(&sim.organisms[dead]);
    assert!(saved.q_table.is_empty());
    assert!(saved.vocabulary.is_empty());
    assert!(saved.conversations.is_empty());
    assert!(saved.memories.entries.len() <= crate::sim::simulation::PendingMemoryFlush::KEEP);
    assert_eq!(saved.archived, Some(false));
    let back = organism::org_from_save(saved, SAVE_SCHEMA_VERSION);
    assert!(!back.archived);
    assert_eq!(back.name, sim.organisms[dead].name);
    assert_eq!(back.lineage_id, sim.organisms[dead].lineage_id);
}

/// #1189: a tribe's recent dead (`recent_deaths`, the source of the
/// `tribe_losses` the tribe card's danger strip reads) are not part of the
/// save, so a reload mid-crisis clears the strip's war, plague and
/// starvation-death triggers until new deaths come in. This pins today's
/// behaviour; persisting them is a save-format change, and this test should
/// flip to assert the losses survive when that lands.
#[test]
fn a_tribes_recent_dead_do_not_survive_a_reload() {
    let seed = 34;
    let mut sim = Simulation::new(seed);
    sim.tick_count = 5_000;
    sim.note_death("clan", "war");
    sim.note_death("clan", "war");
    sim.note_death("clan", "starvation");
    let before = sim.state_json();
    assert_eq!(before["tribe_losses"]["clan"]["war"], 2);
    assert_eq!(before["tribe_losses"]["clan"]["starvation"], 1);

    let mut loaded = Simulation::from_save(seed, sim.to_save_state());
    assert_eq!(loaded.tick_count, 5_000);
    assert!(loaded.recent_deaths.is_empty());
    let after = loaded.state_json();
    assert!(after["tribe_losses"].get("clan").is_none());
}
