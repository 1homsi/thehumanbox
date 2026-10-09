//! Learning from neighbours, grief, mood and friend gravitation.

use super::*;

#[test]
fn cross_lineage_learning_uses_nearby_contact_without_snapshot_clones() {
    let mut sim = Simulation::new(0x1ea1);
    sim.organisms.clear();
    sim.tick_count = 500;

    let mut learner = test_org("learner", "Learner", "lineage-a", 20.0, 20.0);
    learner.traits.curiosity = 1.0;
    learner.traits.social_tendency = 1.0;
    learner.lineage_attitudes.insert("lineage-b".into(), 0.8);
    let mut teacher = test_org("teacher", "Teacher", "lineage-b", 21.0, 20.0);
    teacher.discoveries.insert("bronze_working".into());
    sim.organisms.push(learner);
    sim.organisms.push(teacher);

    let spatial = SpatialIndex::build(&sim.organisms, 8);
    for _ in 0..100 {
        tick_cross_lineage_knowledge(&mut sim, &spatial);
        if sim.organisms[0].discoveries.contains("bronze_working") {
            break;
        }
    }

    assert!(sim.organisms[0].discoveries.contains("bronze_working"));
    assert!(sim.organisms[0].org_trust.get("teacher").copied().unwrap_or(0.0) > 0.0);
}

#[test]
fn deep_grief_sets_a_withdrawal_directive() {
    let mut sim = Simulation::new(7);
    let id = sim.organisms[0].id.clone();
    for _ in 0..20 {
        {
            let org = sim.organisms.iter_mut().find(|o| o.id == id).unwrap();
            org.grief_ticks = 100_000;
            org.comfort = 0.0;
            org.joy_ticks = 0;
            org.fear_level = 0.0;
            org.loneliness = 1.0;
            org.directive_until = 0;
            org.directive.clear();
        }
        sim.tick_count += 45;
        tick_mood(&mut sim);
        let org = sim.organisms.iter().find(|o| o.id == id).unwrap();
        if !org.directive.is_empty() {
            assert!(
                org.directive == "isolate" || org.directive == "rest",
                "unexpected directive {}",
                org.directive
            );
            assert!(org.directive_until > sim.tick_count);
            return;
        }
    }
    panic!("20 mood cycles under maximal grief never set a directive");
}

#[test]
fn good_mood_is_computed_positive() {
    let mut sim = Simulation::new(7);
    let id = sim.organisms[0].id.clone();
    {
        let org = sim.organisms.iter_mut().find(|o| o.id == id).unwrap();
        org.grief_ticks = 0;
        org.joy_ticks = 1200;
        org.comfort = 1.0;
        org.health = 1.0;
        org.fear_level = 0.0;
        org.loneliness = 0.0;
        org.boredom = 0.0;
        org.energy = 1.0;
    }
    sim.tick_count += 45;
    tick_mood(&mut sim);
    let org = sim.organisms.iter().find(|o| o.id == id).unwrap();
    assert!(org.mood > 0.5, "expected positive mood, got {}", org.mood);
}

#[test]
fn friend_gravitation_follows_cross_lineage_friend() {
    let mut sim = Simulation::new(0x51);
    sim.organisms.clear();

    let mut lonely = test_org("lonely", "Lonely", "lineage-a", 20.0, 20.0);
    lonely.friends.insert("friend".into(), "Friend".into());
    lonely.lineage_attitudes.insert("lineage-b".into(), 0.20);
    sim.organisms.push(lonely);
    sim.organisms
        .push(test_org("friend", "Friend", "lineage-b", 42.0, 20.0));

    tick_friend_gravitation(&mut sim);

    assert!(sim.organisms[0].x > 20.0);
    assert_eq!(sim.organisms[0].y, 20.0);
}

#[test]
fn friend_gravitation_ignores_hostile_cross_lineage_friend() {
    let mut sim = Simulation::new(0x52);
    sim.organisms.clear();

    let mut lonely = test_org("lonely", "Lonely", "lineage-a", 20.0, 20.0);
    lonely.friends.insert("friend".into(), "Friend".into());
    lonely.lineage_attitudes.insert("lineage-b".into(), -0.50);
    sim.organisms.push(lonely);
    sim.organisms
        .push(test_org("friend", "Friend", "lineage-b", 42.0, 20.0));

    tick_friend_gravitation(&mut sim);

    assert_eq!(sim.organisms[0].x, 20.0);
    assert_eq!(sim.organisms[0].y, 20.0);
}

#[test]
fn a_sociable_villager_takes_up_trade_at_the_village_centre() {
    use crate::sim::civ::society::settlements;
    use crate::sim::tech::buildings::{Building, BuildingKind};

    let mut sim = Simulation::new(0x7AD3);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        100,
        100,
        Some("village".into()),
        1,
    ));
    sim.buildings[0].condition = 1.0;
    for i in 0..6 {
        let mut villager = test_org(
            &format!("v{i}"),
            &format!("Villager {i}"),
            "village",
            100.0 + i as f32,
            100.0,
        );
        // Adult: a little under three quarters of the lifespan.
        villager.age = 8000;
        villager.traits.social_tendency = 0.9;
        villager.specialty = Some("priest".into());
        sim.organisms.push(villager);
    }
    let mut far = test_org("far", "Far", "village", 160.0, 100.0);
    far.age = 8000;
    far.traits.social_tendency = 0.9;
    far.specialty = Some("priest".into());
    sim.organisms.push(far);
    assert!(
        settlements::snapshots(&sim)
            .iter()
            .any(|settlement| settlement.lineage_id == "village" && settlement.tier >= 1),
        "the village is a settlement of tier 1 or more"
    );

    for _ in 0..200 {
        tick_merchant_drift(&mut sim);
    }

    let merchants = sim.organisms[..6]
        .iter()
        .filter(|org| org.specialty.as_deref() == Some("merchant"))
        .count();
    assert!(merchants > 0, "people at the village centre take up trade");
    assert_eq!(
        sim.organisms[6].specialty.as_deref(),
        Some("priest"),
        "someone beyond the village's reach keeps their work"
    );
}
