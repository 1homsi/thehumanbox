use super::buildings::{Building, BuildingFunction, BuildingKind};
use super::era_homes::{for_era, spec};
use crate::sim::era::LADDER;
use crate::sim::simulation::Simulation;
use std::collections::HashSet;

#[test]
fn every_era_has_thirty_unique_buildable_homes_with_shelter_and_save_roundtrips() {
    let mut kinds = HashSet::new();
    let mut names = HashSet::new();
    for era in LADDER {
        let homes = for_era(era);
        assert_eq!(homes.len(), 30, "{}", era.name());
        for &kind in homes {
            assert!(kinds.insert(kind));
            assert!(names.insert(kind.name()));
            assert!(BuildingKind::all().contains(&kind));
            let home = spec(kind).unwrap();
            assert_eq!(kind.era_unlock(), era);
            assert_eq!(kind.function(), BuildingFunction::Housing);
            assert_eq!(kind.capacity(), home.capacity);
            assert!(kind.capacity() >= 2);
            assert_eq!(kind.footprint(), home.footprint);
            assert!(home.footprint.0 > 0 && home.footprint.1 > 0);
            assert!(kind.construction_cost().labor > 0);
            assert!(kind.construction_cost().wood > 0 || kind.construction_cost().stone > 0);
            let mut building = Building::new(1, kind, 10, 20, Some("owner".into()), 0);
            assert!(!building.provides_shelter_for("owner"));
            assert!(building.is_shelter_project_for("owner"));
            building.condition = 1.0;
            assert!(building.provides_shelter_for("owner"));
            assert!(!building.provides_shelter_for("stranger"));
            let saved = serde_json::to_vec(&building).unwrap();
            let restored: Building = serde_json::from_slice(&saved).unwrap();
            assert_eq!(restored.kind, kind);
            assert_eq!(restored.footprint(), home.footprint);
            assert!(restored.provides_shelter_for("owner"));
            building.decorative = true;
            assert!(!building.provides_shelter_for("owner"));
            building.decorative = false;
            building.damage = 1.0;
            assert!(!building.provides_shelter_for("owner"));
        }
    }
    assert_eq!(kinds.len(), 1050);
    assert_eq!(names.len(), 1050);
}

#[test]
fn every_home_has_an_authoritative_wire_name_footprint_and_housing_function() {
    let mut sim = Simulation::new(706);
    sim.buildings.clear();
    for era in LADDER {
        for &kind in for_era(era) {
            sim.buildings
                .push(Building::new(sim.buildings.len() as u32, kind, 10, 20, None, 0));
        }
    }
    let payload = sim.state_json();
    let wire = payload["buildings"].as_array().unwrap();
    assert_eq!(wire.len(), 1050);
    for (building, serialized) in sim.buildings.iter().zip(wire) {
        assert_eq!(serialized["kind"], building.kind.name());
        assert_eq!(serialized["function"], "housing");
        assert_eq!(serialized["fw"], building.footprint().0);
        assert_eq!(serialized["fh"], building.footprint().1);
    }
}
