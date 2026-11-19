use super::*;
use crate::sim::civ::civ_tick::town::Town;
use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::trade_routes::CaravanKind;
use crate::sim::simulation::Simulation;

fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
    Town {
        id,
        lineage: lineage.into(),
        center,
        streets: Vec::new(),
        founded_tick: 0,
        planned: false,
        growth: 0,
    }
}

fn world(tribes: &[(&str, usize, (f32, f32))]) -> Simulation {
    let mut sim = Simulation::new(93);
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
            o.energy = 1.0;
            o.health = 1.0;
            o.inv_food = 4;
            i += 1;
        }
    }
    sim.towns.clear();
    sim.territory.clear();
    sim.tile_owner.clear();
    sim.treaties.clear();
    sim.battles.clear();
    sim
}

fn claim(sim: &mut Simulation, lineage: &str, centre: (i32, i32), radius: i32) {
    for y in centre.1 - radius..=centre.1 + radius {
        for x in centre.0 - radius..=centre.0 + radius {
            sim.territory.entry(lineage.into()).or_default().insert((x, y));
            sim.tile_owner.insert((x, y), lineage.into());
        }
    }
}

fn finish(sim: &mut Simulation, id: &str, outcome: BattleOutcome) {
    let now = sim.tick_count;
    let b = sim
        .battles
        .iter_mut()
        .find(|b| b.id == id)
        .expect("the battle is on");
    b.ended_tick = Some(now);
    b.outcome = Some(outcome);
    if outcome == BattleOutcome::AttackerVictory {
        b.casualties_d = b.initial_d;
    } else if outcome == BattleOutcome::DefenderVictory {
        b.casualties_a = b.initial_a;
    }
}

fn border_battle(attacker: &str, defender: &str, at: (i32, i32), sim: &Simulation) -> Battle {
    let pick = |l: &str| -> Vec<String> {
        sim.organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == l)
            .take(4)
            .map(|o| o.id.clone())
            .collect()
    };
    let attacker_orgs = pick(attacker);
    let defender_orgs = pick(defender);
    Battle {
        id: format!("border_war_{}_{attacker}_{defender}", sim.tick_count),
        attackers: vec![attacker.into()],
        defenders: vec![defender.into()],
        initial_a: attacker_orgs.len() as u32,
        initial_d: defender_orgs.len() as u32,
        attacker_orgs,
        defender_orgs,
        scale: BattleScale::Siege,
        location: at,
        started_tick: sim.tick_count,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
    }
}

#[test]
fn a_war_over_land_ends_with_villages_and_land_ceded_and_says_why() {
    let mut sim = world(&[
        ("river", 20, (30.0, 50.0)),
        ("hill", 10, (70.0, 50.0)),
        ("hill", 10, (110.0, 50.0)),
    ]);
    sim.lineage_names.insert("river".into(), "Wagepu".into());
    sim.lineage_names.insert("hill".into(), "Kezeziv".into());
    sim.towns = vec![
        town(1, "river", [30, 50]),
        town(2, "hill", [70, 50]),
        town(3, "hill", [110, 50]),
    ];
    claim(&mut sim, "river", (30, 50), 12);
    claim(&mut sim, "hill", (70, 50), 12);
    claim(&mut sim, "hill", (110, 50), 12);
    for _ in 0..3 {
        sim.remember("river", "hill", MemoryKind::Raid, -0.05);
    }
    sim.tick_count = 1_000;
    let battle = border_battle("river", "hill", (55, 50), &sim);
    let id = battle.id.clone();
    let battles = sim.enter_wars(vec![battle], &[(id.clone(), CasusBelli::Water)], true);
    sim.battles.extend(battles);
    assert_eq!(sim.diplomacy.wars.len(), 1);
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("declared war on the Kezeziv over the water after three raids")));

    finish(&mut sim, &id, BattleOutcome::AttackerVictory);
    sim.settle_wars();

    let war = &sim.diplomacy.wars[0];
    assert!(!war.active());
    assert_eq!(war.outcome, Some(WarOutcome::BorderChange));
    assert_eq!(war.winner.as_deref(), Some("river"));
    assert_eq!(war.towns_ceded, 1);
    assert_eq!(
        sim.towns.iter().find(|t| t.id == 2).map(|t| t.lineage.as_str()),
        Some("river")
    );
    assert_eq!(
        sim.towns.iter().find(|t| t.id == 3).map(|t| t.lineage.as_str()),
        Some("hill")
    );
    assert!(sim.territory["river"].contains(&(70, 50)));
    assert!(!sim.territory["hill"].contains(&(70, 50)));
    assert_eq!(
        sim.organisms.iter().filter(|o| o.lineage_id == "hill").count(),
        10
    );
    assert!(has_active_treaty(&sim.treaties, "river", "hill", sim.tick_count));
    assert!(
        sim.diplomacy
            .relations
            .weight("hill", "river", MemoryKind::LandTaken)
            < 0.0
    );
    let line = sim.headlines.back().map(|(_, l)| l.clone()).unwrap_or_default();
    assert!(
        line.contains("The Wagepu went to war with the Kezeziv over the water after three raids; the Kezeziv ceded one village."),
        "{line}"
    );
    assert_eq!(sim.diplomacy.stats.outcomes.get("border_change"), Some(&1));
}

#[test]
fn an_undecided_war_goes_on_and_a_revenge_war_won_brings_tribute() {
    let mut sim = world(&[("river", 20, (30.0, 50.0)), ("hill", 20, (70.0, 50.0))]);
    sim.tick_count = 2_000;
    let battle = border_battle("river", "hill", (50, 50), &sim);
    let id = battle.id.clone();
    let battles = sim.enter_wars(vec![battle], &[(id.clone(), CasusBelli::Revenge)], true);
    sim.battles.extend(battles);
    finish(&mut sim, &id, BattleOutcome::Stalemate);
    sim.settle_wars();
    assert!(sim.diplomacy.wars[0].active(), "a stalemate settles nothing");
    assert!(sim.lineages_at_war().contains("river"));

    let mut found = Vec::new();
    for step in 1..=20u64 {
        sim.tick_count = WAR_STEP * (4 + step);
        found = sim.tick_wars();
        if !found.is_empty() {
            break;
        }
    }
    assert_eq!(found.len(), 1, "the war brings a battle at its front");
    let next = found[0].id.clone();
    assert_eq!(found[0].location, (50, 50));
    sim.battles.extend(found);
    finish(&mut sim, &next, BattleOutcome::AttackerVictory);
    sim.settle_wars();
    let war = &sim.diplomacy.wars[0];
    assert_eq!(war.outcome, Some(WarOutcome::Tribute));
    assert!(sim
        .treaties
        .iter()
        .any(|t| t.kind == TreatyKind::Vassalage && t.lineage_a == "hill" && t.lineage_b == "river"));
}

#[test]
fn an_ally_marches_to_a_defender_and_is_remembered_for_it() {
    let mut sim = world(&[
        ("river", 20, (30.0, 50.0)),
        ("hill", 20, (70.0, 50.0)),
        ("ford", 12, (90.0, 50.0)),
    ]);
    sim.lineage_names.insert("ford".into(), "Ostaro".into());
    sim.treaties.push(Treaty {
        lineage_a: "hill".into(),
        lineage_b: "ford".into(),
        kind: TreatyKind::Alliance,
        signed_tick: 0,
        expires_tick: 100_000,
    });
    sim.tick_count = 3_000;
    let battle = border_battle("river", "hill", (50, 50), &sim);
    let id = battle.id.clone();
    let battles = sim.enter_wars(vec![battle], &[(id, CasusBelli::Land)], true);
    let b = &battles[0];
    assert_eq!(b.defenders, vec!["hill".to_string(), "ford".to_string()]);
    assert!(b.defender_orgs.len() > 4);
    assert_eq!(b.initial_d as usize, b.defender_orgs.len());
    assert_eq!(sim.diplomacy.wars[0].allies, vec!["ford".to_string()]);
    assert!(sim.diplomacy.relations.weight("hill", "ford", MemoryKind::Aid) > 0.0);
    assert!(sim
        .headlines
        .iter()
        .any(|(_, l)| l.contains("The Ostaro marched to the aid of")));
}

#[test]
fn a_raid_is_remembered_and_three_raids_are_a_reason_for_war() {
    let mut sim = world(&[("river", 10, (30.0, 50.0)), ("hill", 10, (40.0, 50.0))]);
    let facts = sim.tribe_facts();
    let at_war = Default::default();
    let minds = WarMinds {
        relations: &sim.diplomacy.relations,
        facts: &facts,
        sides: &NO_SIDES,
        at_war: &at_war,
    };
    assert_eq!(minds.casus("hill", "river", false), None);
    let raid = Battle {
        scale: BattleScale::Raid,
        id: "battle_1_river_hill".into(),
        ..border_battle("river", "hill", (35, 50), &sim)
    };
    for _ in 0..3 {
        let kept = sim.enter_wars(vec![raid.clone()], &[], false);
        assert_eq!(kept.len(), 1);
    }
    assert!(sim.diplomacy.wars.is_empty(), "a raid is not a war");
    assert_eq!(
        sim.diplomacy.relations.count("hill", "river", MemoryKind::Raid),
        3
    );
    let minds = WarMinds {
        relations: &sim.diplomacy.relations,
        facts: &facts,
        sides: &NO_SIDES,
        at_war: &at_war,
    };
    assert_eq!(minds.casus("hill", "river", false), Some(CasusBelli::Revenge));
}

#[test]
fn an_ally_sends_grain_to_a_starving_town_along_the_road_and_is_thanked() {
    let mut sim = world(&[("hill", 8, (70.0, 50.0)), ("ford", 10, (90.0, 50.0))]);
    sim.towns = vec![town(1, "hill", [70, 50]), town(2, "ford", [90, 50])];
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == "hill") {
        o.inv_food = 0;
        o.energy = 0.3;
    }
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == "ford") {
        o.inv_food = 9;
    }
    sim.treaties.push(Treaty {
        lineage_a: "hill".into(),
        lineage_b: "ford".into(),
        kind: TreatyKind::Alliance,
        signed_tick: 0,
        expires_tick: 100_000,
    });
    sim.caravans.clear();
    sim.tick_count = crate::sim::cosmos::DAY_LENGTH * 3 + crate::sim::cosmos::DAY_LENGTH / 4;
    sim.tick_relief();
    let relief: Vec<_> = sim
        .caravans
        .iter()
        .filter(|c| c.kind == CaravanKind::Relief)
        .collect();
    assert_eq!(relief.len(), 1);
    let caravan = relief[0].clone();
    assert_eq!(
        (caravan.sender_lineage.as_str(), caravan.receiver_lineage.as_str()),
        ("ford", "hill")
    );
    assert_eq!(caravan.cargo, "food");
    let sent: u32 = sim
        .organisms
        .iter()
        .filter(|o| o.lineage_id == "ford")
        .map(|o| 9 - u32::from(o.inv_food))
        .sum();
    assert_eq!(sent, caravan.amount);
    assert_eq!(sim.diplomacy.stats.relief_shipments, 1);

    sim.tick_relief();
    assert_eq!(
        sim.caravans
            .iter()
            .filter(|c| c.kind == CaravanKind::Relief)
            .count(),
        1,
        "one shipment at a time"
    );

    sim.tick_count = caravan.arrives_tick;
    assert!(crate::sim::civ::trade_routes::receive_due_for_lineage(
        &mut sim, "hill"
    ));
    assert!(sim.caravans.iter().all(|c| c.kind != CaravanKind::Relief));
    assert!(sim
        .organisms
        .iter()
        .any(|o| o.lineage_id == "hill" && o.inv_food > 0));
    assert!(sim.diplomacy.relations.weight("hill", "ford", MemoryKind::Relief) > 0.25);
}

#[test]
fn a_vassal_sends_tribute_and_resents_it() {
    let mut sim = world(&[("hill", 10, (70.0, 50.0)), ("river", 10, (30.0, 50.0))]);
    sim.towns = vec![town(1, "hill", [70, 50]), town(2, "river", [30, 50])];
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == "hill") {
        o.inv_food = 8;
    }
    sim.treaties.push(Treaty {
        lineage_a: "hill".into(),
        lineage_b: "river".into(),
        kind: TreatyKind::Vassalage,
        signed_tick: 0,
        expires_tick: 100_000,
    });
    sim.caravans.clear();
    sim.tick_count = crate::sim::cosmos::DAY_LENGTH * 4 + crate::sim::cosmos::DAY_LENGTH / 4;
    sim.tick_relief();
    let tribute: Vec<_> = sim
        .caravans
        .iter()
        .filter(|c| c.kind == CaravanKind::Tribute)
        .cloned()
        .collect();
    assert_eq!(tribute.len(), 1);
    assert_eq!(tribute[0].receiver_lineage, "river");
    sim.tick_count = tribute[0].arrives_tick;
    assert!(crate::sim::civ::trade_routes::receive_due_for_lineage(
        &mut sim, "river"
    ));
    assert!(
        sim.diplomacy
            .relations
            .weight("hill", "river", MemoryKind::Tribute)
            < 0.0
    );
    assert_eq!(sim.diplomacy.stats.tribute_shipments, 1);
}

#[test]
fn wars_and_memories_survive_a_save_and_an_old_save_starts_from_its_treaties() {
    use crate::sim::storage::persistence::SaveState;
    let mut sim = world(&[("river", 20, (30.0, 50.0)), ("hill", 20, (70.0, 50.0))]);
    sim.tick_count = 1_000;
    let battle = border_battle("river", "hill", (50, 50), &sim);
    let id = battle.id.clone();
    let battles = sim.enter_wars(vec![battle], &[(id, CasusBelli::Faith)], true);
    sim.battles.extend(battles);
    sim.remember("hill", "river", MemoryKind::Raid, -0.3);
    let bytes = sim.to_save_state().to_bytes();
    let loaded = Simulation::from_save(sim.world_seed, SaveState::from_bytes(&bytes).expect("reads"));
    assert_eq!(loaded.diplomacy.wars, sim.diplomacy.wars);
    assert_eq!(loaded.diplomacy.relations, sim.diplomacy.relations);
    assert_eq!(loaded.diplomacy.next_war_id, 2);

    let mut old = world(&[("river", 4, (30.0, 50.0)), ("hill", 4, (70.0, 50.0))]);
    old.treaties.push(Treaty {
        lineage_a: "river".into(),
        lineage_b: "hill".into(),
        kind: TreatyKind::Alliance,
        signed_tick: 0,
        expires_tick: 100_000,
    });
    let mut value = serde_json::to_value(old.to_save_state()).expect("json");
    value.as_object_mut().expect("object").remove("diplomacy");
    let state: SaveState = serde_json::from_value(value).expect("an old save reads");
    let loaded = Simulation::from_save(old.world_seed, state);
    assert!(loaded.diplomacy.wars.is_empty());
    assert!(loaded.diplomacy.relations.standing("river", "hill") > 0.2);
}
