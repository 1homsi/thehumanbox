use super::*;
use crate::sim::civ::culture::{Religion, ReligionKind};

fn faith(id: &str, name: &str) -> Religion {
    Religion {
        id: id.into(),
        kind: ReligionKind::Animism,
        name: name.into(),
        founded_tick: 1,
        founder_lineage: "clan".into(),
        adherents: 0,
        last_milestone: None,
    }
}

#[test]
fn a_faith_nobody_keeps_is_forgotten_and_a_kept_one_is_not() {
    let mut sim = Simulation::new(41);
    sim.religions = vec![faith("kept", "The Living Way"), faith("lost", "The Old Path")];
    for o in &mut sim.organisms {
        o.religion_id = None;
    }
    sim.organisms[0].alive = true;
    sim.organisms[0].religion_id = Some("kept".into());
    sim.events.clear();
    for step in 0..=(FAITH_FORGOTTEN_TICKS / 240 + 1) {
        sim.tick_count = 1_000 + step * 240;
        tick_religion_adherents(&mut sim);
    }
    let left: Vec<&str> = sim.religions.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(left, vec!["kept"]);
    assert!(sim
        .events
        .iter()
        .any(|e| e.actor == "The Old Path" && e.detail.contains("was forgotten")));
}

#[test]
fn a_vanished_tribe_holds_no_land() {
    let mut sim = Simulation::new(42);
    let living = sim.organisms.iter().find(|o| o.alive).unwrap().lineage_id.clone();
    sim.territory
        .insert(living.clone(), [(1, 1)].into_iter().collect());
    sim.territory
        .insert("gone".into(), [(2, 2)].into_iter().collect());
    sim.lineage_homes.insert("gone".into(), [2, 2, 0]);
    forget_vanished_tribes(&mut sim);
    assert!(sim.territory.contains_key(&living));
    assert!(!sim.territory.contains_key("gone"));
    assert!(!sim.lineage_homes.contains_key("gone"));
}

#[test]
fn a_tribe_raises_its_schools_and_laboratories_before_the_rest_of_the_town() {
    let mut existing: HashSet<BuildingKind> = HashSet::default();
    let mut order = Vec::new();
    for _ in 0..5 {
        let kind = next_target_building(Era::Renaissance, 45, 350, &existing).unwrap();
        existing.insert(kind);
        order.push(kind);
    }
    for lab in [
        BuildingKind::School,
        BuildingKind::Library,
        BuildingKind::Observatory,
        BuildingKind::University,
    ] {
        assert!(order[..4].contains(&lab), "{lab:?} came late: {order:?}");
    }
    // Too small a tribe has no use for them yet.
    let small = next_target_building(Era::Renaissance, 5, 350, &HashSet::default()).unwrap();
    assert_ne!(small, BuildingKind::University);
}
