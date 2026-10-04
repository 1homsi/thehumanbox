//! Autonomous diplomacy, religion founding, schisms and recounts.

use super::*;

#[test]
fn autonomous_diplomacy_respects_active_battles_and_keeps_one_treaty() {
    use crate::sim::warfare::{Battle, BattleScale, TreatyKind};

    let mut sim = Simulation::new(0xD1_9101);
    sim.organisms.clear();
    let mut river = test_org("river-one", "River", "river", 50.0, 50.0);
    let mut hill = test_org("hill-one", "Hill", "hill", 51.0, 50.0);
    river.lineage_attitudes.insert("hill".into(), 0.8);
    hill.lineage_attitudes.insert("river".into(), 0.8);
    sim.organisms.extend([river, hill]);
    sim.battles.push(Battle {
        id: "battle-river-hill".into(),
        attackers: vec!["river".into()],
        defenders: vec!["hill".into()],
        attacker_orgs: vec!["river-one".into()],
        defender_orgs: vec!["hill-one".into()],
        scale: BattleScale::Skirmish,
        location: (50, 50),
        started_tick: 100,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 1,
        initial_d: 1,
    });

    sim.tick_count = 800;
    tick_diplomacy(&mut sim);
    assert!(sim.treaties.is_empty());

    sim.battles[0].ended_tick = Some(900);
    sim.tick_count = 1_600;
    tick_diplomacy(&mut sim);
    assert_eq!(sim.treaties.len(), 1);
    assert_eq!(sim.treaties[0].kind, TreatyKind::Alliance);

    sim.tick_count = 2_400;
    tick_diplomacy(&mut sim);
    assert_eq!(sim.treaties.len(), 1);
}

#[test]
fn autonomous_religion_founding_assigns_a_real_founder() {
    let mut sim = Simulation::new(0xFA_1001);
    sim.organisms.truncate(5);
    sim.religions.clear();
    sim.religions.push(Religion {
        id: "rel1".into(),
        kind: ReligionKind::Animism,
        name: "Existing Path".into(),
        founded_tick: 1,
        founder_lineage: "other-lineage".into(),
        adherents: 0,
        last_milestone: None,
    });
    sim.next_religion_id = 1;
    let lineage = "autonomous-faith-lineage";
    for organism in &mut sim.organisms {
        organism.alive = true;
        organism.lineage_id = lineage.into();
        organism.religion_id = None;
        organism.piety = 0.0;
    }
    sim.lineage_aggregates.clear();
    sim.lineage_eras.insert(lineage.into(), Era::PreStone);

    for attempt in 1..=500 {
        sim.tick_count = attempt * 2_400;
        tick_religion_founding(&mut sim);
        if sim.religions.len() > 1 {
            break;
        }
    }

    let religion = sim
        .religions
        .iter()
        .find(|religion| religion.founder_lineage == lineage)
        .expect("a faith should eventually be founded");
    assert_eq!(religion.id, "rel2");
    let followers: Vec<_> = sim
        .organisms
        .iter()
        .filter(|organism| organism.alive && organism.religion_id.as_deref() == Some(religion.id.as_str()))
        .collect();
    assert_eq!(followers.len(), 1);
    assert!(followers[0].piety >= 0.30);
    assert_eq!(religion.adherents, 1);
}

#[test]
fn autonomous_schism_uses_unique_ids_and_recounts_both_faiths() {
    let mut sim = Simulation::new(0xFA_1003);
    sim.organisms.clear();
    for index in 0..12 {
        let mut follower = test_org(
            &format!("follower-{index}"),
            &format!("Follower {index}"),
            "shared-lineage",
            20.0 + index as f32,
            20.0,
        );
        follower.religion_id = Some("rel1".into());
        sim.organisms.push(follower);
    }
    sim.religions.clear();
    sim.religions.push(Religion {
        id: "rel1".into(),
        kind: ReligionKind::Animism,
        name: "Parent Path".into(),
        founded_tick: 1,
        founder_lineage: "shared-lineage".into(),
        adherents: 12,
        last_milestone: None,
    });
    sim.next_religion_id = 1;

    for attempt in 1..=1_000 {
        sim.tick_count = attempt * 1_600;
        tick_religion_schism(&mut sim);
        if sim.religions.len() > 1 {
            break;
        }
    }

    assert_eq!(sim.religions.len(), 2);
    assert!(sim.religions.iter().any(|religion| religion.id == "rel2"));
    assert_eq!(
        sim.religions
            .iter()
            .map(|religion| religion.adherents)
            .sum::<u32>(),
        12
    );
    assert!(sim
        .religions
        .iter()
        .find(|religion| religion.id == "rel1")
        .is_some_and(|religion| religion.adherents > 0));
}

#[test]
fn periodic_religion_recount_sets_extinct_faiths_to_zero() {
    let mut sim = Simulation::new(0xFA_1002);
    for organism in &mut sim.organisms {
        organism.religion_id = None;
    }
    sim.religions.clear();
    sim.religions.push(Religion {
        id: "rel-extinct".into(),
        kind: ReligionKind::Animism,
        name: "Forgotten Path".into(),
        founded_tick: 1,
        founder_lineage: "extinct-lineage".into(),
        adherents: 42,
        last_milestone: None,
    });

    tick_religion_adherents(&mut sim);

    assert_eq!(sim.religions[0].adherents, 0);
}
