use super::*;

#[test]
fn footprint_smoke() {
    assert_eq!(BuildingKind::Hut.footprint(), (1, 1));
    assert_eq!(BuildingKind::Apartment.footprint(), (4, 4));
    assert_eq!(BuildingKind::Bridge.footprint(), (4, 1));
}

#[test]
fn era_unlock_progression() {
    assert!(BuildingKind::Hut.era_unlock() < BuildingKind::House.era_unlock());
    assert!(BuildingKind::House.era_unlock() < BuildingKind::Manor.era_unlock());
    assert!(BuildingKind::Manor.era_unlock() < BuildingKind::Apartment.era_unlock());
}

#[test]
fn construction_costs_use_real_resources_and_scale_labor() {
    let hut = BuildingKind::Hut.construction_cost();
    let factory = BuildingKind::Factory.construction_cost();
    let megastructure = BuildingKind::Megastructure.construction_cost();

    assert!(hut.wood > 0);
    assert_eq!(hut.wealth, 0);
    assert!(
        factory.stone > 0,
        "advanced sites still need a physical foundation"
    );
    assert!(
        factory.wealth > 0,
        "refined industrial materials are financed through wealth"
    );
    assert!(factory.labor > hut.labor);
    assert!(megastructure.labor > factory.labor);
    assert!(BuildingKind::Megastructure.construction_crew_capacity() > 1);

    for kind in BuildingKind::all() {
        let cost = kind.construction_cost();
        assert!(
            cost.wood > 0 || cost.stone > 0,
            "{} has no material cost",
            kind.name()
        );
        assert!(cost.labor > 0, "{} has no labor cost", kind.name());
    }
}

#[test]
fn new_functional_buildings_start_incomplete() {
    let mut building = Building::new(1, BuildingKind::School, 0, 0, Some("lineage".into()), 10);
    assert!(!building.is_complete());
    assert!(!building.is_operational());
    assert_eq!(building.condition, 0.0);

    building.condition = 1.0;
    assert!(building.is_operational());
    building.damage = 1.0;
    building.ruined_at_tick = Some(20);
    assert!(building.is_complete());
    assert!(building.is_ruined());
    assert!(!building.is_operational());
    building.decorative = true;
    assert!(!building.is_operational());
}

#[test]
fn older_building_json_migrates_as_healthy() {
    let building = Building::new(1, BuildingKind::House, 2, 3, Some("lineage".into()), 10);
    let mut value = serde_json::to_value(building).unwrap();
    let object = value.as_object_mut().unwrap();
    object.remove("damage");
    object.remove("ruined_at_tick");
    object.remove("last_damage_tick");
    object.remove("last_repair_tick");

    let restored: Building = serde_json::from_value(value).unwrap();
    assert_eq!(restored.damage_fraction(), 0.0);
    assert!(!restored.is_ruined());
    assert_eq!(restored.integrity(), 1.0);
}

#[test]
fn repairing_requires_a_completed_site_and_the_latest_activity_to_be_repair() {
    let mut building = Building::new(1, BuildingKind::House, 2, 3, Some("lineage".into()), 10);
    building.condition = 1.0;
    building.damage = 0.5;
    building.last_damage_tick = Some(15);
    building.last_repair_tick = Some(20);
    assert!(building.is_repairing_at(20 + REPAIR_ACTIVITY_TICKS));
    assert!(!building.is_repairing_at(21 + REPAIR_ACTIVITY_TICKS));

    building.last_damage_tick = Some(21);
    assert!(!building.is_repairing_at(22));
    building.last_repair_tick = Some(22);
    building.condition = 0.5;
    assert!(!building.is_repairing_at(22));
    building.condition = 1.0;
    building.decorative = true;
    assert!(!building.is_repairing_at(22));
}

#[test]
fn shelter_requires_completed_operational_housing_and_respects_ownership() {
    let mut hut = Building::new(1, BuildingKind::Hut, 4, 5, Some("lineage-a".into()), 10);
    assert!(!hut.provides_shelter_for("lineage-a"));
    assert!(hut.is_shelter_project_for("lineage-a"));
    assert!(!hut.is_shelter_project_for("lineage-b"));

    hut.condition = 1.0;
    assert!(hut.provides_shelter_for("lineage-a"));
    assert!(!hut.provides_shelter_for("lineage-b"));
    assert!(!hut.is_shelter_project_for("lineage-a"));

    hut.decorative = true;
    assert!(!hut.provides_shelter_for("lineage-a"));

    let mut shared_house = Building::new(2, BuildingKind::House, 8, 9, None, 10);
    shared_house.condition = 1.0;
    assert!(shared_house.provides_shelter_for("lineage-a"));
    assert!(shared_house.provides_shelter_for("lineage-b"));
    assert_eq!(shared_house.closest_footprint_tile(20, 8), (9, 9));
}

#[test]
fn saves_with_retired_era_home_kinds_still_load() {
    let mut building = Building::new(7, BuildingKind::House, 3, 4, None, 1);
    building.condition = 1.0;
    let mut json = serde_json::to_value(&building).unwrap();
    for (name, expected) in [
        ("MedievalTwinTimberHall", BuildingKind::House),
        ("BronzeEnclosedCourtyardHouse", BuildingKind::Manor),
        ("PreStoneReedWindbreak", BuildingKind::Hut),
        ("Apartment", BuildingKind::Apartment),
    ] {
        json["kind"] = serde_json::Value::String(name.to_string());
        let loaded: Building = serde_json::from_value(json.clone()).expect("loads");
        assert_eq!(loaded.kind, expected, "{name}");
    }
}
