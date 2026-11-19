use super::*;
use crate::sim::civ::civ_tick::town::Town;
use crate::sim::civ::society::government::{Government, GovernmentKind};
use crate::sim::civ::society::nations::Nation;
use crate::sim::civ::warfare::{CasusBelli, TribeFacts, WarMinds};

fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
    Town {
        id,
        lineage: lineage.into(),
        center,
        ..Default::default()
    }
}

fn world(tribes: &[(&str, usize, [i32; 2])]) -> Simulation {
    let mut sim = Simulation::new(61);
    let total: usize = tribes.iter().map(|t| t.1).sum();
    sim.organisms.truncate(total);
    let mut i = 0;
    for &(lineage, n, [x, y]) in tribes {
        for k in 0..n {
            let o = &mut sim.organisms[i];
            o.alive = true;
            o.age = o.max_age / 2;
            o.lineage_id = lineage.into();
            o.x = (x + k as i32) as f32;
            o.y = y as f32;
            o.home_x = o.x;
            o.home_y = o.y;
            o.partner_id = None;
            o.parent_id = String::new();
            o.father_id = None;
            o.religion_id = None;
            o.sex = if k % 2 == 0 { Sex::Male } else { Sex::Female };
            o.traits = Default::default();
            i += 1;
        }
        sim.lineage_names.insert(lineage.into(), format!("{lineage}folk"));
    }
    sim.towns.clear();
    sim.treaties.clear();
    sim.battles.clear();
    sim.governments.clear();
    sim.road_net = Default::default();
    sim.diplomacy = Default::default();
    sim
}

fn nation(sim: &mut Simulation, id: u32, name: &str, members: &[&str], capital: u32) {
    sim.diplomacy.nations.push(Nation {
        id,
        name: name.into(),
        capital,
        ruler: members[0].into(),
        members: members.iter().map(|m| (*m).to_string()).collect(),
        colour: id as u8,
        founded_tick: 0,
        cohesion: 1.0,
        sovereign: None,
    });
    sim.index_nations();
}

fn crown(sim: &mut Simulation, lineage: &str, person: usize) {
    let mut g = Government::new(lineage.into(), GovernmentKind::Monarchy, 0);
    g.leader_id = Some(sim.organisms[person].id.to_string());
    sim.governments.insert(lineage.into(), g);
}

fn pass(sim: &mut Simulation, n: u64) {
    sim.tick_count = NATION_STEP * n + RULER_PHASE;
    sim.tick_rulers();
}

#[test]
fn a_ruler_takes_the_throne_with_their_character_and_their_child_carries_the_house_on() {
    let mut sim = world(&[("crown", 6, [100, 100])]);
    sim.towns = vec![town(1, "crown", [100, 100])];
    nation(&mut sim, 1, "Ovarra", &["crown"], 1);
    sim.organisms[0].traits.aggression = 0.9;
    sim.organisms[0].traits.curiosity = 0.7;
    crown(&mut sim, "crown", 0);
    pass(&mut sim, 1);
    let s = sim.diplomacy.nations[0].sovereign.clone().expect("a ruler");
    assert_eq!(s.person, sim.organisms[0].id);
    assert_eq!(s.traits, vec![RulerTrait::Warlike, RulerTrait::Builder]);
    assert_eq!(s.generation, 1);
    assert!(sim.ruled_by("crown", RulerTrait::Warlike));
    assert!(sim.events.iter().any(|e| e.detail.contains("now rules Ovarra")));
    let facts = sim.tribe_facts();
    assert!(facts["crown"].ambition >= WARLIKE_AMBITION);

    sim.organisms[2].parent_id = sim.organisms[0].id.to_string();
    sim.organisms[2].traits.aggression = 0.2;
    crown(&mut sim, "crown", 2);
    pass(&mut sim, 2);
    let heir = sim.diplomacy.nations[0].sovereign.clone().unwrap();
    assert_eq!((heir.house.as_str(), heir.generation), (s.house.as_str(), 2));
    assert_eq!(heir.traits, vec![RulerTrait::Peaceful]);
    assert_eq!(sim.diplomacy.stats.new_dynasties, 0);

    crown(&mut sim, "crown", 4);
    pass(&mut sim, 3);
    let usurper = sim.diplomacy.nations[0].sovereign.clone().unwrap();
    assert_eq!(usurper.generation, 1);
    assert_ne!(usurper.house, s.house);
    assert_eq!(sim.diplomacy.stats.new_dynasties, 1);
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("A new house takes the throne of Ovarra")));
}

#[test]
fn two_crowns_on_good_terms_are_wed_into_an_alliance_and_a_claim_that_a_new_house_presses() {
    let mut sim = world(&[("east", 6, [100, 100]), ("west", 6, [140, 100])]);
    sim.towns = vec![town(1, "east", [100, 100]), town(2, "west", [140, 100])];
    nation(&mut sim, 1, "Ovarra", &["east"], 1);
    nation(&mut sim, 2, "Rize", &["west"], 2);
    for i in [0, 6] {
        sim.organisms[i].traits.social_tendency = 0.9;
    }
    crown(&mut sim, "east", 0);
    crown(&mut sim, "west", 6);
    let mut wed = false;
    for n in 1..60 {
        pass(&mut sim, n);
        if sim.diplomacy.stats.royal_marriages > 0 {
            wed = true;
            break;
        }
    }
    assert!(wed, "diplomat rulers arrange a match within a few years");
    let m = sim.diplomacy.marriages[0].clone();
    assert_eq!((m.a, m.b), (1, 2));
    let spouses: Vec<&crate::organism::organism::Organism> =
        sim.organisms.iter().filter(|o| o.partner_id.is_some()).collect();
    assert_eq!(spouses.len(), 2);
    assert!(sim
        .treaties
        .iter()
        .any(|t| t.kind == TreatyKind::Alliance && t.lineage_a == "east" && t.lineage_b == "west"));
    assert!(sim.diplomacy.relations.standing("west", "east") > 0.2);
    assert_eq!(sim.diplomacy.claims.len(), 1);
    assert!(!sim.diplomacy.claims[0].pressed);
    assert!(sim.pressed_claims().is_empty());

    crown(&mut sim, "west", 9);
    sim.tick_count += NATION_STEP;
    sim.tick_rulers();
    assert!(sim.diplomacy.claims[0].pressed);
    let pressed = sim.pressed_claims();
    assert!(pressed.contains(&("east".to_string(), "west".to_string())));
    let facts = sim.tribe_facts();
    assert_eq!(facts["east"].claims, vec!["west".to_string()]);
}

#[test]
fn a_pressed_claim_is_a_reason_for_war() {
    let relations = crate::sim::civ::society::relations::Relations::default();
    let mut facts: BTreeMap<String, TribeFacts> = BTreeMap::new();
    facts.insert(
        "a".into(),
        TribeFacts {
            pop: 20,
            water: 10,
            claims: vec!["b".into()],
            ..TribeFacts::default()
        },
    );
    facts.insert(
        "b".into(),
        TribeFacts {
            pop: 20,
            water: 10,
            ..TribeFacts::default()
        },
    );
    let sides = BTreeMap::new();
    let at_war = BTreeSet::new();
    let minds = WarMinds {
        relations: &relations,
        facts: &facts,
        sides: &sides,
        at_war: &at_war,
    };
    assert_eq!(minds.casus("a", "b", false), Some(CasusBelli::Succession));
    assert_eq!(minds.casus("b", "a", false), None);
}

#[test]
fn faith_travels_the_road_to_a_neighbour_and_tribes_of_one_faith_feel_close() {
    let mut sim = world(&[
        ("east", 6, [100, 100]),
        ("west", 6, [130, 100]),
        ("north", 4, [100, 70]),
    ]);
    sim.towns = vec![
        town(1, "east", [100, 100]),
        town(2, "west", [130, 100]),
        town(3, "north", [100, 70]),
    ];
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id != "west") {
        o.religion_id = Some("sun".into());
    }
    sim.road_net.edges.push(crate::sim::civ::land::road_net::NetEdge {
        id: 1,
        owner: "east".into(),
        from_town: 1,
        to_town: Some(2),
        from: [100, 100],
        to: [130, 100],
        path: vec![[100, 100], [130, 100]],
        built: 2,
        ..Default::default()
    });
    pass(&mut sim, 1);
    let converts = sim
        .organisms
        .iter()
        .filter(|o| o.lineage_id == "west" && o.religion_id.as_deref() == Some("sun"))
        .count();
    assert_eq!(converts, 1);
    assert_eq!(sim.diplomacy.stats.faith_converts, 1);
    assert!(sim.diplomacy.relations.standing("east", "north") > 0.0);
    assert_eq!(sim.diplomacy.relations.standing("east", "west"), 0.0);
}

#[test]
fn a_nation_holds_its_festival_at_its_capital_and_its_tribes_come_together() {
    let mut sim = world(&[("crown", 9, [100, 100]), ("vassal", 9, [120, 100])]);
    sim.towns = vec![town(1, "crown", [104, 102]), town(2, "vassal", [120, 100])];
    nation(&mut sim, 1, "Ovarra", &["crown", "vassal"], 1);
    sim.festivals.clear();
    sim.festival_last.clear();
    sim.lineage_homes.insert("crown".into(), [100, 100, 0]);
    sim.lineage_homes.insert("vassal".into(), [120, 100, 0]);
    sim.tick_count = crate::sim::config::SEASON_LENGTH * 4 + 120;
    sim.tick_festivals();
    let held = sim
        .festivals
        .iter()
        .find(|f| f.lineage_id == "crown")
        .expect("a festival");
    assert_eq!(held.center, [104, 102]);
    assert_eq!(sim.diplomacy.stats.shared_festivals, 1);
    assert!(sim.diplomacy.relations.standing("vassal", "crown") > 0.0);
    assert!(sim.events.iter().any(|e| e.detail.contains("Ovarra held its")));
}
