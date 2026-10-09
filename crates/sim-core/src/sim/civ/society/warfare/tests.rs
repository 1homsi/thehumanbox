use super::*;
use crate::sim::civ::government::{GovernmentKind, Law};
use crate::sim::simulation::Simulation;
use rand::SeedableRng;

fn treaty(a: &str, b: &str, kind: TreatyKind, signed_tick: u64, expires_tick: u64) -> Treaty {
    Treaty {
        lineage_a: a.to_string(),
        lineage_b: b.to_string(),
        kind,
        signed_tick,
        expires_tick,
    }
}

#[test]
fn damage_multipliers_monotonic() {
    assert!(damage_multiplier(CombatStyle::Brawl) < damage_multiplier(CombatStyle::Spear));
    assert!(damage_multiplier(CombatStyle::Spear) < damage_multiplier(CombatStyle::Sword));
    assert!(damage_multiplier(CombatStyle::Sword) < damage_multiplier(CombatStyle::Pike));
    assert!(damage_multiplier(CombatStyle::Pike) < damage_multiplier(CombatStyle::Musket));
    assert!(damage_multiplier(CombatStyle::Musket) < damage_multiplier(CombatStyle::Rifle));
    assert!(damage_multiplier(CombatStyle::Rifle) < damage_multiplier(CombatStyle::Modern));
}

#[test]
fn scale_thresholds() {
    assert!(matches!(scale_for_participants(2), BattleScale::Skirmish));
    assert!(matches!(scale_for_participants(6), BattleScale::Raid));
    assert!(matches!(scale_for_participants(10), BattleScale::Siege));
    assert!(matches!(scale_for_participants(20), BattleScale::Battle));
    assert!(matches!(scale_for_participants(40), BattleScale::War));
}

#[test]
fn same_kind_renewal_extends_without_stacking_goodwill() {
    let mut sim = Simulation::new(85);
    sim.organisms.truncate(4);
    for (index, organism) in sim.organisms.iter_mut().enumerate() {
        organism.alive = true;
        organism.lineage_id = if index < 2 { "river".into() } else { "hill".into() };
    }

    assert!(establish_treaty(
        &mut sim.treaties,
        &mut sim.organisms,
        "river",
        "hill",
        TreatyKind::NonAggression,
        10,
        100,
    ));
    let attitudes_after_signing: Vec<f32> = sim
        .organisms
        .iter()
        .map(|organism| {
            let other = if organism.lineage_id == "river" {
                "hill"
            } else {
                "river"
            };
            organism.attitude_toward(other)
        })
        .collect();

    assert!(establish_treaty(
        &mut sim.treaties,
        &mut sim.organisms,
        "hill",
        "river",
        TreatyKind::NonAggression,
        20,
        200,
    ));

    assert_eq!(sim.treaties.len(), 1);
    assert_eq!(sim.treaties[0].signed_tick, 20);
    assert_eq!(sim.treaties[0].expires_tick, 200);
    let attitudes_after_renewal: Vec<f32> = sim
        .organisms
        .iter()
        .map(|organism| {
            let other = if organism.lineage_id == "river" {
                "hill"
            } else {
                "river"
            };
            organism.attitude_toward(other)
        })
        .collect();
    assert_eq!(attitudes_after_renewal, attitudes_after_signing);

    assert!(establish_treaty(
        &mut sim.treaties,
        &mut sim.organisms,
        "river",
        "hill",
        TreatyKind::NonAggression,
        201,
        300,
    ));
    assert!(sim.organisms[0].attitude_toward("hill") > attitudes_after_renewal[0]);
}

#[test]
fn consolidation_deterministically_removes_expired_invalid_and_duplicate_records() {
    let records = vec![
        treaty("a", "b", TreatyKind::NonAggression, 1, 10),
        treaty("b", "a", TreatyKind::NonAggression, 20, 100),
        treaty("a", "b", TreatyKind::Trade, 30, 90),
        treaty("same", "same", TreatyKind::Alliance, 10, 100),
        treaty("future", "other", TreatyKind::Trade, 100, 200),
        treaty("vassal", "ruler", TreatyKind::Vassalage, 40, 140),
    ];
    let mut forward = records.clone();
    let mut reverse = records;
    reverse.reverse();

    assert_eq!(consolidate_treaties(&mut forward, 50), 4);
    assert_eq!(consolidate_treaties(&mut reverse, 50), 4);

    assert_eq!(forward, reverse, "input order must not change consolidation");
    assert_eq!(forward.len(), 2);
    let pair = forward
        .iter()
        .find(|record| treaty_matches_lineages(record, "a", "b"))
        .unwrap();
    assert_eq!(pair.kind, TreatyKind::Trade);
    assert_eq!(pair.signed_tick, 30);
    let vassalage = forward
        .iter()
        .find(|record| record.kind == TreatyKind::Vassalage)
        .unwrap();
    assert_eq!(vassalage.lineage_a, "vassal", "direction must be preserved");
    assert_eq!(vassalage.lineage_b, "ruler");
}

#[test]
fn opposing_lineages_in_an_unfinished_battle_cannot_negotiate() {
    let mut battle = Battle {
        id: "active-conflict".into(),
        attackers: vec!["river".into()],
        defenders: vec!["hill".into()],
        attacker_orgs: Vec::new(),
        defender_orgs: Vec::new(),
        scale: BattleScale::Skirmish,
        location: (20, 20),
        started_tick: 1,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 1,
        initial_d: 1,
    };

    assert!(has_active_battle_between(
        std::slice::from_ref(&battle),
        "river",
        "hill"
    ));
    assert!(has_active_battle_between(
        std::slice::from_ref(&battle),
        "hill",
        "river"
    ));
    battle.ended_tick = Some(20);
    assert!(!has_active_battle_between(&[battle], "river", "hill"));
}

#[test]
fn combatant_selection_uses_normalized_age_stages() {
    let mut sim = Simulation::new(84);
    let ages = [
        ("infant", 50),
        ("child", 200),
        ("teen", 300),
        ("adult", 500),
        ("elder", 800),
    ];
    let indices: Vec<_> = sim
        .organisms
        .iter()
        .enumerate()
        .filter_map(|(index, org)| org.alive.then_some(index))
        .take(ages.len())
        .collect();
    assert_eq!(indices.len(), ages.len());
    for (position, (index, (id, age))) in indices.iter().copied().zip(ages).enumerate() {
        let org = &mut sim.organisms[index];
        org.id = id.into();
        org.lineage_id = "guard".into();
        org.age = age;
        org.max_age = 1_000;
        org.x = position as f32;
        org.y = 0.0;
    }
    let populations = HashMap::from_iter([("guard".to_string(), indices)]);
    let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(84);

    let selected = pick_combatants(
        &sim.organisms,
        &populations,
        "guard",
        ages.len(),
        (0, 0),
        &mut rng,
    );

    assert_eq!(selected.len(), 3);
    assert!(!selected.iter().any(|id| id == "infant" || id == "child"));
    assert!(selected.iter().any(|id| id == "teen"));
    assert!(selected.iter().any(|id| id == "adult"));
    assert!(selected.iter().any(|id| id == "elder"));
}

#[test]
fn training_and_equipment_create_real_combat_advantage() {
    let mut sim = Simulation::new(81);
    let index = sim.organisms.iter().position(|org| org.alive).unwrap();
    let civilian_bonus = soldier_bonus(&sim.organisms[index]);
    let recruit = &mut sim.organisms[index];
    recruit.specialty = Some("soldier".into());
    recruit.tools.insert("spear".into(), 1);
    assert!(soldier_bonus(recruit) > civilian_bonus + 0.2);
    recruit.tools.insert("rifle".into(), 1);
    assert!(soldier_bonus(recruit) > 0.5);
}

#[test]
fn firearm_style_applies_only_to_the_equipped_combatant() {
    let mut sim = Simulation::new(82);
    let mut indices = sim
        .organisms
        .iter()
        .enumerate()
        .filter_map(|(index, org)| org.alive.then_some(index));
    let armed = indices.next().unwrap();
    let unarmed = indices.next().unwrap();
    sim.organisms[armed].tools.insert("rifle".into(), 1);

    assert_eq!(
        combat_style_for(&sim.organisms[armed], Era::Modern),
        CombatStyle::Modern
    );
    assert_eq!(
        combat_style_for(&sim.organisms[unarmed], Era::Modern),
        CombatStyle::Brawl,
        "one rifle must not upgrade the rest of the force"
    );
}

#[test]
fn military_law_and_funding_improve_coordination() {
    let mut government = Government::new("guard".into(), GovernmentKind::Republic, 1);
    assert_eq!(military_policy_bonus(Some(&government)), 0.0);
    government.laws.push(Law {
        kind: LawKind::MilitaryService,
        enacted_tick: 2,
    });
    let unfunded = military_policy_bonus(Some(&government));
    government.treasury = 500;
    assert!(military_policy_bonus(Some(&government)) > unfunded);
}

#[test]
fn defense_bonus_requires_completed_defender_owned_fortifications() {
    let defenders = vec!["guard".to_string()];
    let mut wall = Building::new(1, BuildingKind::Wall, 20, 20, Some("guard".into()), 1);
    assert!(!nearby_operational_defense(&[wall.clone()], &defenders, (20, 20)));

    wall.condition = 1.0;
    assert!(nearby_operational_defense(&[wall.clone()], &defenders, (23, 20)));

    wall.kind = BuildingKind::Temple;
    assert!(!nearby_operational_defense(&[wall.clone()], &defenders, (20, 20)));

    wall.kind = BuildingKind::Watchtower;
    wall.owner_lineage = Some("attacker".into());
    assert!(!nearby_operational_defense(&[wall], &defenders, (20, 20)));

    let field_position = FieldFortification {
        x: 22,
        y: 20,
        lineage_id: "guard".into(),
    };
    let mut sim = Simulation::new(83);
    *sim.grid.structure_at_mut(22, 20) = 0.12;
    assert!(nearby_field_fortification(
        std::slice::from_ref(&field_position),
        &defenders,
        (20, 20),
        &sim.grid,
    ));
    assert!(!nearby_field_fortification(
        &[FieldFortification {
            lineage_id: "attacker".into(),
            ..field_position
        }],
        &defenders,
        (20, 20),
        &sim.grid,
    ));
    *sim.grid.structure_at_mut(22, 20) = 0.0;
    assert!(!nearby_field_fortification(
        &[FieldFortification {
            x: 22,
            y: 20,
            lineage_id: "guard".into(),
        }],
        &defenders,
        (20, 20),
        &sim.grid,
    ));
}

#[test]
fn battle_deaths_are_counted_in_their_year_and_written_into_the_life_story() {
    let mut sim = Simulation::new(91);
    sim.organisms.truncate(4);
    for (index, organism) in sim.organisms.iter_mut().enumerate() {
        organism.alive = true;
        organism.health = 0.01;
        organism.lineage_id = if index < 2 { "river".into() } else { "hill".into() };
    }
    let ids: Vec<String> = sim.organisms.iter().map(|o| o.id.clone()).collect();
    let mut battles = vec![Battle {
        id: "river-hill".into(),
        attackers: vec!["river".into()],
        defenders: vec!["hill".into()],
        attacker_orgs: ids[..2].to_vec(),
        defender_orgs: ids[2..].to_vec(),
        scale: BattleScale::Skirmish,
        location: (50, 50),
        started_tick: 0,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 2,
        initial_d: 2,
    }];
    let lineage_eras = HashMap::default();
    let governments = HashMap::default();
    let mut treaties = Vec::new();
    let mut events = std::collections::VecDeque::new();
    let mut rng = <rand_chacha::ChaCha8Rng as SeedableRng>::seed_from_u64(7);
    let tick = 3 * crate::sim::cosmos::YEAR_LENGTH_TICKS + 40;
    tick_battles(
        tick,
        &mut rng,
        &mut battles,
        &mut treaties,
        &mut sim.organisms,
        &mut events,
        &mut sim.history,
        BattleInstitutions {
            lineage_eras: &lineage_eras,
            governments: &governments,
            buildings: &[],
            field_fortifications: &[],
            grid: &sim.grid,
        },
    );

    assert!(sim.organisms.iter().all(|o| !o.alive));
    assert_eq!(sim.history.deaths_combat, 4);
    let yearly: u64 = sim.history.deaths_by_year.iter().map(|&n| u64::from(n)).sum();
    assert_eq!(yearly, 4);
    assert_eq!(sim.history.deaths_by_year.get(3).copied(), Some(4));
    for organism in &sim.organisms {
        assert_eq!(organism.death_cause, "war");
        assert!(organism
            .life_log
            .iter()
            .any(|e| e.category == "death" && e.text.starts_with("fell in battle")));
    }
}
