use super::*;

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
    assert_eq!(state.version, 5);
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
