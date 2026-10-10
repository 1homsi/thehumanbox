use super::*;

#[test]
fn lookahead_uses_the_same_safe_tick_bounds_as_the_runtime() {
    assert!((lookahead_ticks_for_values(Some("150"), Some("100")) - 1.5).abs() < f32::EPSILON);
    assert!((lookahead_ticks_for_values(Some("150"), Some("0")) - 1.5).abs() < f32::EPSILON);
    assert!((lookahead_ticks_for_values(Some("150"), Some("8")) - 9.375).abs() < f32::EPSILON);
    assert_eq!(lookahead_ticks_for_values(Some("-5"), Some("100")), 0.0);
}

/// Lock the delta payload's top-level shape. The client wire
/// round-trip test in client/src/simulation/wire.roundtrip.test.ts
/// expects these exact keys; if a refactor here removes one
/// without coordinating the rename, this test catches it before
/// it reaches the wire.
#[test]
fn delta_payload_has_expected_top_level_keys() {
    let mut sim = Simulation::new(42);
    // Bump tick past the boot-time "include all entities" cutoff so
    // we exercise the actual delta path the client sees in steady
    // state. Boot frames are conceptually a full snapshot anyway.
    sim.tick_count = 5;
    let payload = sim.state_json_incremental();
    let obj = payload.as_object().expect("payload must be a JSON object");
    for key in &[
        "tick",
        "grid",
        "organisms_complete",
        "animals",
        "animals_complete",
        "is_day",
        "day_progress",
        "season",
        "season_progress",
        "drought",
        "weather",
        "lineage_strategies",
        "lineage_strategy_history",
    ] {
        assert!(obj.contains_key(*key), "delta payload missing key `{}`", key);
    }
    // The hot-SoA path is what the client decodes for deltas.
    assert!(
        obj.contains_key("organisms_hot"),
        "delta payload must carry organisms_hot"
    );
    // Wind made it into the weather object.
    let weather = obj["weather"].as_object().unwrap();
    for key in &["kind", "intensity", "wind_x", "wind_y"] {
        assert!(weather.contains_key(*key), "weather missing key `{}`", key);
    }
}

#[test]
fn building_wire_contract_separates_construction_from_damage() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(420);
    sim.buildings.clear();
    let mut building = Building::new(9, BuildingKind::House, 40, 41, Some("wire".into()), 12);
    building.condition = 1.0;
    building.damage = 0.40;
    building.ruined_at_tick = Some(55);
    building.last_damage_tick = Some(56);
    building.last_repair_tick = Some(57);
    sim.buildings.push(building);
    sim.tick_count = 58;

    let payload = sim.state_json();
    let building = payload["buildings"][0].as_object().expect("building object");

    assert_eq!(building["condition"].as_f64(), Some(1.0));
    assert_eq!(building["construction_progress"].as_f64(), Some(1.0));
    assert!((building["damage"].as_f64().unwrap() - 0.40).abs() < 0.000_001);
    assert!((building["integrity"].as_f64().unwrap() - 0.60).abs() < 0.000_001);
    assert_eq!(building["ruined"].as_bool(), Some(true));
    assert_eq!(building["repairing"].as_bool(), Some(true));
    assert_eq!(building["ruined_at_tick"].as_u64(), Some(55));
    assert_eq!(building["last_damage_tick"].as_u64(), Some(56));
    assert_eq!(building["last_repair_tick"].as_u64(), Some(57));
}

#[test]
fn incremental_payload_only_resends_buildings_after_state_changes() {
    let mut sim = Simulation::new(421);
    sim.tick_count = 5;

    let initial = sim.state_json_incremental();
    assert!(
        initial.get("buildings").is_none(),
        "unchanged building state should stay off the hot wire"
    );

    sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    let changed = sim.state_json_incremental();
    assert!(changed["buildings"].is_array());

    let unchanged = sim.state_json_incremental();
    assert!(
        unchanged.get("buildings").is_none(),
        "building state should only be sent once per revision"
    );
}

#[test]
fn full_payload_includes_lineage_era_progress() {
    let mut sim = Simulation::new(42);
    let lid = sim
        .organisms
        .iter()
        .find(|o| o.alive)
        .expect("founder exists")
        .lineage_id
        .clone();
    for org in sim.organisms.iter_mut().filter(|o| o.lineage_id == lid) {
        org.discoveries.insert("fire".to_string());
        org.discoveries.insert("stone_tools".to_string());
        org.discoveries.insert("shelter".to_string());
        org.discoveries.insert("smelting".to_string());
    }
    let mut kept_one_lineage_member = false;
    for org in sim.organisms.iter_mut().filter(|o| o.lineage_id == lid) {
        if kept_one_lineage_member {
            org.alive = false;
        } else {
            kept_one_lineage_member = true;
        }
    }
    sim.lineage_eras.insert(lid.clone(), crate::sim::era::Era::Stone);

    let world_population = sim.organisms.iter().filter(|o| o.alive).count();

    let payload = sim.state_json();
    let rows = payload
        .get("lineage_era_progress")
        .and_then(|v| v.as_array())
        .expect("lineage_era_progress array");
    let row = rows
        .iter()
        .find(|row| row.get("lineage_id").and_then(|v| v.as_str()) == Some(lid.as_str()))
        .expect("progress for lineage");

    assert_eq!(row.get("era_name").and_then(|v| v.as_str()), Some("stone"));
    assert_eq!(row.get("next_era").and_then(|v| v.as_str()), Some("bronze"));
    assert_eq!(row.get("pop").and_then(|v| v.as_u64()), Some(1));
    assert_eq!(row.get("pop_ready").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(row.get("lineage_population").and_then(|v| v.as_u64()), Some(1));
    assert_eq!(
        row.get("world_population").and_then(|v| v.as_u64()),
        Some(world_population as u64)
    );
    assert_eq!(
        row.get("world_population_required").and_then(|v| v.as_u64()),
        Some(crate::sim::era::Era::Bronze.pop_threshold() as u64)
    );
    assert_eq!(
        row.get("world_population_ready").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(row.get("known").and_then(|v| v.as_array()).unwrap().len(), 1);
    assert!(row
        .get("missing")
        .and_then(|v| v.as_array())
        .unwrap()
        .iter()
        .any(|v| v.as_str() == Some("agriculture")));
}

/// Verify that ages was actually dropped from the SoA payload -
/// the wire-slim-down work is only worth committing if the
/// serialised payload actually omits the field.
#[test]
fn organisms_hot_does_not_include_ages() {
    let mut sim = Simulation::new(7);
    sim.tick_count = 5;
    // Need at least one alive org so the SoA isn't empty.
    // The default `new` constructor seeds a small starter pop.
    let payload = sim.state_json_incremental();
    let hot = payload
        .as_object()
        .unwrap()
        .get("organisms_hot")
        .expect("organisms_hot present");
    let obj = hot.as_object().expect("organisms_hot is an object");
    assert!(
        !obj.contains_key("ages"),
        "ages must NOT be serialized in delta SoA - saves 4 bytes/org/tick"
    );
    // Spot-check that we still have the fields the client expects.
    for key in &["ids", "xs", "ys", "vxs", "vys", "energies", "thoughts"] {
        assert!(
            obj.contains_key(*key),
            "organisms_hot missing required key `{}`",
            key
        );
    }
}

#[test]
fn every_payload_exposes_only_active_player_guidance() {
    let mut sim = Simulation::new(43);
    let lid = sim
        .organisms
        .iter()
        .find(|org| org.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.tick_count = 500;
    sim.lineage_strategies.insert(lid.clone(), ("trade".into(), 900));
    sim.lineage_strategy_objectives.insert(
        lid.clone(),
        crate::sim::simulation::StrategyObjective {
            strategy: "trade".into(),
            started_tick: 450,
            expires_tick: 900,
            progress: 17,
            target: 80,
            completed_tick: None,
            failed_tick: None,
        },
    );
    sim.lineage_strategies
        .insert("expired".into(), ("hunt".into(), 400));
    sim.lineage_strategy_history
        .push_back(crate::sim::simulation::StrategyCampaignRecord {
            lineage_id: lid.clone(),
            lineage_name: "Wayfinders".into(),
            strategy: "explore".into(),
            started_tick: 100,
            ended_tick: 420,
            progress: 60,
            target: 60,
            outcome: "completed".into(),
            reason: None,
        });

    let payload = sim.state_json();
    let strategies = payload["lineage_strategies"].as_object().unwrap();
    assert_eq!(strategies[&lid]["strategy"].as_str(), Some("trade"));
    assert_eq!(strategies[&lid]["started_tick"].as_u64(), Some(450));
    assert_eq!(strategies[&lid]["progress"].as_u64(), Some(17));
    assert_eq!(strategies[&lid]["target"].as_u64(), Some(80));
    assert_eq!(strategies[&lid]["completed"].as_bool(), Some(false));
    assert_eq!(strategies[&lid]["status"].as_str(), Some("active"));
    assert!(!strategies.contains_key("expired"));
    let history = payload["lineage_strategy_history"].as_array().unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0]["lineage_id"].as_str(), Some(lid.as_str()));
    assert_eq!(history[0]["strategy"].as_str(), Some("explore"));
    assert_eq!(history[0]["outcome"].as_str(), Some("completed"));

    let incremental = sim.state_json_incremental();
    let strategies = incremental["lineage_strategies"].as_object().unwrap();
    assert_eq!(strategies[&lid]["strategy"].as_str(), Some("trade"));
    assert!(!strategies.contains_key("expired"));
    let history = incremental["lineage_strategy_history"].as_array().unwrap();
    assert_eq!(history.len(), 1);
}

#[test]
fn full_payload_exposes_farm_lifecycle_contract() {
    let mut sim = Simulation::new(44);
    let lineage_id = sim
        .organisms
        .iter()
        .find(|org| org.alive)
        .unwrap()
        .lineage_id
        .clone();
    sim.tick_count = 1_300;
    sim.lineage_eras
        .insert(lineage_id.clone(), crate::sim::era::Era::Bronze);
    sim.farms.push(crate::sim::agriculture::Farm {
        id: 7,
        x: 120,
        y: 120,
        owner_lineage: lineage_id.clone(),
        crop: crate::sim::agriculture::CropKind::Wheat,
        planted_tick: 100,
        ready_tick: 1_300,
        harvested: false,
        prepared: false,
        season_timed: false,
        withered: false,
    });

    let payload = sim.state_json();
    let farm = payload["farms"][0].as_object().expect("farm object");
    let actual: std::collections::BTreeSet<&str> = farm.keys().map(String::as_str).collect();
    let expected: std::collections::BTreeSet<&str> = [
        "id",
        "x",
        "y",
        "crop",
        "lineage_id",
        "planted_tick",
        "ready_tick",
        "harvested",
        "withered",
        "stage",
        "progress",
        "yield",
    ]
    .into_iter()
    .collect();

    assert_eq!(actual, expected);
    assert_eq!(farm["id"].as_u64(), Some(7));
    assert_eq!(farm["crop"].as_str(), Some("wheat"));
    assert_eq!(farm["lineage_id"].as_str(), Some(lineage_id.as_str()));
    assert_eq!(farm["stage"].as_str(), Some("mature"));
    assert_eq!(farm["progress"].as_f64(), Some(1.0));
    assert!(farm["yield"].as_u64().is_some_and(|value| value > 0));
}

#[test]
fn full_payload_exposes_authoritative_settlement_contract() {
    use crate::sim::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(45);
    let lineage_id = "settlement-wire".to_string();
    sim.lineage_names.clear();
    sim.lineage_names
        .insert(lineage_id.clone(), "Harbor Folk".to_string());
    for (index, org) in sim.organisms.iter_mut().enumerate() {
        org.alive = index < 4;
        if org.alive {
            org.lineage_id = lineage_id.clone();
            org.x = 100.0 + index as f32;
            org.y = 110.0;
        }
    }
    sim.buildings.clear();
    for (id, kind, x) in [(1, BuildingKind::House, 100), (2, BuildingKind::Hut, 104)] {
        let mut building = Building::new(id, kind, x, 110, Some(lineage_id.clone()), 1);
        building.condition = 1.0;
        sim.buildings.push(building);
    }

    let payload = sim.state_json();
    let settlement = payload["settlements"][0].as_object().expect("settlement object");
    let actual: std::collections::BTreeSet<&str> = settlement.keys().map(String::as_str).collect();
    let expected: std::collections::BTreeSet<&str> = [
        "lineage_id",
        "name",
        "tier",
        "tier_name",
        "center",
        "population",
        "building_count",
        "capacity",
        "score",
    ]
    .into_iter()
    .collect();

    assert_eq!(actual, expected);
    assert_eq!(settlement["lineage_id"].as_str(), Some(lineage_id.as_str()));
    assert_eq!(settlement["name"].as_str(), Some("Harbor Folk"));
    assert_eq!(settlement["tier"].as_u64(), Some(2));
    assert_eq!(settlement["tier_name"].as_str(), Some("hamlet"));
    assert_eq!(settlement["population"].as_u64(), Some(4));
    assert_eq!(settlement["building_count"].as_u64(), Some(2));
    assert_eq!(settlement["capacity"].as_u64(), Some(6));
    assert!(settlement["score"].as_u64().is_some_and(|score| score >= 24));
    assert_eq!(settlement["center"].as_array().map(Vec::len), Some(2));
}

/// The typed buildings section must equal the `json!` objects it replaced,
/// as values and as JSON text, for every kind and for the odd states a
/// building can be in: owned or not, damaged, ruined, repairing, unfinished,
/// NaN damage and condition.
#[test]
fn typed_buildings_match_the_value_reference() {
    use crate::sim::buildings::{Building, BuildingKind};
    let mut sim = Simulation::new(42);
    sim.buildings.clear();
    sim.tick_count = 5_000;
    for (i, kind) in BuildingKind::all().iter().enumerate() {
        let owner = (i % 3 != 0).then(|| format!("lineage-{}", i % 5));
        let mut b = Building::new(
            i as u32 + 1,
            *kind,
            i as i32 * 7 % 600,
            i as i32 * 3 % 300,
            owner,
            12,
        );
        b.condition = match i % 5 {
            0 => 1.0,
            1 => 0.37,
            2 => f32::NAN,
            3 => 0.999,
            _ => 0.0,
        };
        match i % 7 {
            1 => b.damage = 0.3,
            2 => {
                b.damage = 1.0;
                b.ruined_at_tick = Some(4_000);
            }
            3 => {
                b.damage = 0.5;
                b.last_damage_tick = Some(4_960);
                b.last_repair_tick = Some(4_990);
                b.condition = 1.0;
            }
            4 => b.damage = f32::NAN,
            5 => {
                b.damage = 0.0001;
                b.last_repair_tick = Some(1);
            }
            _ => {}
        }
        sim.buildings.push(b);
    }
    assert!(sim.buildings.len() > 50);
    let reference = sim.buildings_value_reference();
    let frame = sim.state_frame().into_value();
    assert_eq!(frame["buildings"], reference);
    assert_eq!(
        serde_json::to_string(&frame["buildings"]).unwrap(),
        serde_json::to_string(&reference).unwrap()
    );
    // And the typed section serialises like its `Value`.
    let typed = sim.state_frame();
    let entries = typed.entries();
    let (_, entry) = entries.iter().find(|(k, _)| *k == "buildings").unwrap();
    assert_eq!(
        serde_json::to_string(entry).unwrap(),
        serde_json::to_string(&reference).unwrap()
    );
}

#[test]
fn building_function_labels_match_the_debug_names() {
    use crate::sim::buildings::{BuildingFunction::*, BuildingKind};
    for function in [
        Housing,
        Education,
        Worship,
        Trade,
        Industry,
        Healthcare,
        Military,
        Civic,
        Infrastructure,
        Recreation,
    ] {
        assert_eq!(function.label(), format!("{function:?}").to_lowercase());
    }
    for kind in BuildingKind::all() {
        assert_eq!(
            kind.function().label(),
            format!("{:?}", kind.function()).to_lowercase()
        );
    }
}

/// `entity_head` moves the grid, organism and animal sections into the
/// frame; the old `json!` construction deep-copied them. On a world that
/// has run for a while both must give the same bytes for every frame kind.
#[test]
fn entity_head_matches_the_deep_copy_reference() {
    use crate::organism::organism::OrgsHotSoa;
    use crate::world::grid::{VP_H, VP_W};
    let mut sim = Simulation::new(42);
    for _ in 0..400 {
        sim.tick();
    }
    let grid = |sim: &Simulation| sim.grid.to_json_viewport(300, 150, VP_W, VP_H, true, true, true);
    let animals: Vec<serde_json::Value> = sim
        .animals
        .iter()
        .map(|a| serde_json::to_value(a.to_json(0)).unwrap())
        .collect();
    let animals = serde_json::Value::Array(animals);

    // Full frame: the organism list is a `Value` section.
    let list: Vec<serde_json::Value> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| serde_json::to_value(o.to_json_with(false)).unwrap())
        .collect();
    assert!(!list.is_empty());
    let new = sim
        .entity_head(
            grid(&sim),
            HeadOrganisms::Full(list.clone()),
            animals.clone(),
            true,
        )
        .into_value();
    let old = sim.entity_head_reference(
        serde_json::to_value(grid(&sim)).unwrap(),
        serde_json::Value::Array(list),
        animals.clone(),
        true,
    );
    assert_eq!(new, old);
    assert_eq!(
        serde_json::to_vec(&new).unwrap(),
        serde_json::to_vec(&old).unwrap()
    );

    // Delta frame: the hot arrays stay typed until the encoder.
    let mut soa = OrgsHotSoa::with_capacity(sim.organisms.len());
    for o in sim.organisms.iter_mut().filter(|o| o.alive) {
        soa.push(o, 0.0);
    }
    let hot_value = serde_json::to_value(&soa).unwrap();
    let new = sim
        .entity_head(
            grid(&sim),
            HeadOrganisms::Hot(Box::new(soa)),
            animals.clone(),
            false,
        )
        .into_value();
    let old = sim.entity_head_reference(
        serde_json::to_value(grid(&sim)).unwrap(),
        hot_value,
        animals,
        false,
    );
    assert_eq!(new, old);
    assert_eq!(
        serde_json::to_vec(&new).unwrap(),
        serde_json::to_vec(&old).unwrap()
    );
}

/// The typed frame is serialised straight to the wire; the `Value` frame is
/// what every consumer used to get. Their JSON must be identical for every
/// frame kind, in the same key order (this also guards the alphabetical
/// field order of `GridJson` and `OrgsHotSoa`). The server tests compare
/// the encoded msgpack frames as well.
#[test]
fn typed_frame_serialises_like_the_value_frame() {
    let mut typed_world = Simulation::new(7);
    let mut value_world = Simulation::new(7);
    for _ in 0..400 {
        typed_world.tick();
        value_world.tick();
    }
    let mut kinds = std::collections::BTreeSet::new();
    for round in 0..130u64 {
        for _ in 0..3 {
            typed_world.tick();
            value_world.tick();
        }
        // Cover periodic full frames, deltas (hot arrays) and deep fulls.
        let (typed, value) = match round % 13 {
            0 => (typed_world.state_frame(), value_world.state_json()),
            6 => (
                typed_world.state_frame_periodic_full(),
                value_world.state_json_periodic_full(),
            ),
            _ => (
                typed_world.state_frame_incremental(),
                value_world.state_json_incremental(),
            ),
        };
        kinds.insert(value.get("organisms_hot").is_some());
        assert_eq!(
            serde_json::to_string(&typed).unwrap(),
            serde_json::to_string(&value).unwrap(),
            "round {round}"
        );
        assert_eq!(typed.into_value(), value, "round {round}");
    }
    assert_eq!(kinds.len(), 2, "both hot-array and full-organism frames occur");
}
