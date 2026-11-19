use super::*;
use crate::sim::civ::civ_tick::town::Town;
use crate::sim::civ::warfare::{Treaty, WarOutcome};

fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
    Town {
        id,
        lineage: lineage.into(),
        center,
        streets: Vec::new(),
        founded_tick: 0,
        planned: false,
        growth: 0,
        ..Default::default()
    }
}

fn world(tribes: &[(&str, usize, (f32, f32))]) -> Simulation {
    let mut sim = Simulation::new(41);
    let total: usize = tribes.iter().map(|t| t.1).sum();
    sim.organisms.truncate(total);
    let mut i = 0;
    for &(lineage, n, (x, y)) in tribes {
        for k in 0..n {
            let o = &mut sim.organisms[i];
            o.alive = true;
            o.age = o.max_age / 3;
            o.lineage_attitudes.clear();
            o.lineage_id = lineage.into();
            o.x = x + (k % 3) as f32;
            o.y = y + (k / 3) as f32 % 3.0;
            o.home_x = o.x;
            o.home_y = o.y;
            i += 1;
        }
        sim.lineage_names.insert(lineage.into(), format!("{lineage}folk"));
    }
    sim.towns.clear();
    sim.treaties.clear();
    sim.battles.clear();
    sim.diplomacy = Default::default();
    sim
}

fn pass(sim: &mut Simulation, n: u64) {
    sim.tick_count = NATION_STEP * n + NATION_PHASE;
    sim.tick_nations();
}

fn alliance(a: &str, b: &str) -> Treaty {
    Treaty {
        lineage_a: a.into(),
        lineage_b: b.into(),
        kind: TreatyKind::Alliance,
        signed_tick: 0,
        expires_tick: 1_000_000,
    }
}

#[test]
fn a_great_tribe_with_two_towns_founds_a_nation_with_a_name_a_colour_and_a_capital() {
    let mut sim = world(&[("crown", 30, (50.0, 50.0)), ("hamlet", 6, (250.0, 50.0))]);
    sim.towns = vec![
        town(4, "crown", [50, 50]),
        town(2, "crown", [70, 50]),
        town(3, "hamlet", [250, 50]),
    ];
    sim.settlement_tiers.insert("crown".into(), 4);
    sim.settlement_tiers.insert("hamlet".into(), 4);
    pass(&mut sim, 3);
    assert_eq!(sim.diplomacy.nations.len(), 1);
    let n = sim.diplomacy.nations[0].clone();
    assert_eq!(n.members, vec!["crown".to_string()]);
    assert_eq!(n.capital, 2);
    assert!(!n.name.is_empty());
    assert_eq!(n.colour, 0);
    assert_eq!(sim.nation_of("crown").map(|n| n.id), Some(n.id));
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains(&format!("founded the nation of {}", n.name))));

    sim.towns.retain(|t| t.id != 2);
    pass(&mut sim, 4);
    assert!(
        sim.diplomacy.nations.is_empty(),
        "a lone tribe with one town is no nation"
    );
    assert_eq!(sim.diplomacy.stats.nations_dissolved, 1);
}

#[test]
fn old_allies_who_live_close_and_think_well_of_each_other_unite_and_stop_fighting() {
    let mut sim = world(&[
        ("east", 12, (50.0, 50.0)),
        ("west", 8, (90.0, 50.0)),
        ("far", 8, (300.0, 50.0)),
    ]);
    sim.towns = vec![
        town(1, "east", [50, 50]),
        town(2, "west", [90, 50]),
        town(3, "far", [300, 50]),
    ];
    sim.treaties = vec![alliance("east", "west"), alliance("east", "far")];
    pass(&mut sim, 2);
    assert!(
        sim.diplomacy.nations.is_empty(),
        "allies who think nothing of each other stay apart"
    );
    for (a, b) in [("east", "west"), ("east", "far")] {
        sim.diplomacy.relations.remember(a, b, MemoryKind::Peace, 0.3, 0);
        sim.diplomacy.relations.remember(b, a, MemoryKind::Peace, 0.3, 0);
    }
    pass(&mut sim, 3);
    assert_eq!(sim.diplomacy.nations.len(), 1);
    let n = sim.diplomacy.nations[0].clone();
    assert_eq!(n.ruler, "east");
    assert_eq!(n.members, vec!["east".to_string(), "west".to_string()]);
    assert_eq!(n.capital, 1);
    assert!(sim.same_side("east", "west"));
    assert!(!sim.same_side("east", "far"), "too far to be one country");
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("The eastfolk and the westfolk united as")));

    let facts = sim.tribe_facts();
    let at_war = Default::default();
    let minds = crate::sim::civ::warfare::WarMinds {
        relations: &sim.diplomacy.relations,
        facts: &facts,
        sides: &sim.diplomacy.nation_of,
        at_war: &at_war,
    };
    assert!(minds.same_side("west", "east"));
}

#[test]
fn a_war_won_for_ambition_brings_the_loser_into_the_winners_nation() {
    let mut sim = world(&[("big", 30, (50.0, 50.0)), ("small", 12, (80.0, 50.0))]);
    sim.towns = vec![
        town(1, "big", [50, 50]),
        town(2, "small", [80, 50]),
        town(3, "small", [120, 50]),
    ];
    sim.tick_count = 5_000;
    let wi = sim.declare_war("big", "small", CasusBelli::Ambition, [65, 50]);
    sim.diplomacy.wars[wi].score = 2;
    sim.end_war(wi, Some("big".into()));
    assert_eq!(sim.diplomacy.wars[wi].outcome, Some(WarOutcome::Absorption));
    assert!(sim.same_side("big", "small"));
    let n = sim.nation_of("small").expect("the loser belongs to a nation");
    assert_eq!(n.ruler, "big");
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("The smallfolk now belong to")));
}

#[test]
fn a_far_and_bitter_member_breaks_away_in_a_civil_war() {
    let mut sim = world(&[
        ("core", 20, (50.0, 50.0)),
        ("edge", 10, (300.0, 50.0)),
        ("loyal", 10, (70.0, 50.0)),
    ]);
    sim.towns = vec![
        town(1, "core", [50, 50]),
        town(2, "edge", [300, 50]),
        town(3, "loyal", [70, 50]),
    ];
    sim.diplomacy.nations.push(Nation {
        id: 7,
        name: "Ovarra".into(),
        capital: 1,
        ruler: "core".into(),
        members: vec!["core".into(), "edge".into(), "loyal".into()],
        colour: 3,
        founded_tick: 0,
        cohesion: 1.0,
    });
    sim.diplomacy.next_nation_id = 8;
    sim.index_nations();
    sim.diplomacy
        .relations
        .remember("edge", "core", MemoryKind::Border, -0.3, 0);
    sim.settlement_tiers.insert("core".into(), 4);
    pass(&mut sim, 2);
    let n = sim
        .diplomacy
        .nations
        .iter()
        .find(|n| n.id == 7)
        .expect("the nation stands");
    assert_eq!(n.members, vec!["core".to_string(), "loyal".to_string()]);
    assert!(!sim.same_side("edge", "core"));
    assert_eq!(sim.diplomacy.stats.civil_wars, 1);
    let war = sim.diplomacy.wars.last().expect("a civil war");
    assert_eq!((war.attacker.as_str(), war.defender.as_str()), ("edge", "core"));
    assert_eq!(war.reason, CasusBelli::Independence);
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("Civil war: the edgefolk rose against Ovarra")));
}

#[test]
fn nations_survive_a_save_and_are_found_again_by_their_members() {
    use crate::sim::storage::persistence::SaveState;
    let mut sim = world(&[("east", 12, (50.0, 50.0)), ("west", 8, (90.0, 50.0))]);
    sim.diplomacy.nations.push(Nation {
        id: 3,
        name: "Ovarra".into(),
        capital: 1,
        ruler: "east".into(),
        members: vec!["east".into(), "west".into()],
        colour: 5,
        founded_tick: 10,
        cohesion: 0.8,
    });
    sim.diplomacy.next_nation_id = 4;
    sim.index_nations();
    let bytes = sim.to_save_state().to_bytes();
    let loaded = Simulation::from_save(sim.world_seed, SaveState::from_bytes(&bytes).expect("reads"));
    assert_eq!(loaded.diplomacy.nations, sim.diplomacy.nations);
    assert_eq!(loaded.diplomacy.next_nation_id, 4);
    assert!(loaded.same_side("east", "west"));
}

#[test]
fn a_small_tribe_beside_a_strong_neighbour_seeks_its_protection() {
    let mut sim = world(&[
        ("strong", 30, (50.0, 50.0)),
        ("small", 5, (90.0, 50.0)),
        ("hostile", 5, (60.0, 80.0)),
    ]);
    sim.towns = vec![
        town(1, "strong", [50, 50]),
        town(2, "small", [90, 50]),
        town(3, "hostile", [60, 80]),
    ];
    sim.diplomacy
        .relations
        .remember("hostile", "strong", MemoryKind::Raid, -0.4, 0);
    pass(&mut sim, 1);
    let n = sim.nation_of("small").expect("the small tribe is under a nation");
    assert_eq!(n.ruler, "strong");
    assert!(
        sim.nation_of("hostile").is_none(),
        "a tribe with a grudge does not seek protection"
    );
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("The smallfolk sought the protection of the strongfolk")));
    assert_eq!(sim.diplomacy.stats.protected, 1);
}
