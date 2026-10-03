use super::*;
use crate::organism::organism::Organism;
use crate::organism::traits::Traits;

fn test_org(id: &str, name: &str, lineage: &str, x: f32, y: f32) -> Organism {
    let mut org = Organism::new(
        id.to_string(),
        name.to_string(),
        x,
        y,
        0,
        String::new(),
        lineage.to_string(),
        20_000,
        Traits::default(),
    );
    org.alive = true;
    org.age = 1500;
    org.energy = 0.8;
    org.loneliness = 0.85;
    org
}

#[test]
fn scenery_respects_full_footprints_water_and_legacy_buildings() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(703);
    sim.buildings.clear();
    for y in 20..50 {
        for x in 20..50 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let home = Building::new(1, BuildingKind::House, 30, 30, None, 0);
    sim.buildings.push(home);
    for (id, x, y) in [(2, 31, 31), (3, 35, 35), (4, 35, 35), (5, 40, 40)] {
        let mut prop = Building::new(id, BuildingKind::Garden, x, y, None, 0);
        prop.decorative = true;
        sim.buildings.push(prop);
    }
    sim.grid.set(41, 41, Tile::Water);
    let revision = sim.building_state_revision;
    let occupied = reconcile_prop_sites(&mut sim);
    assert_eq!(sim.buildings.iter().map(|b| b.id).collect::<Vec<_>>(), vec![1, 3]);
    assert_ne!(sim.building_state_revision, revision);
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        29,
        29
    ));
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        40,
        40
    ));
    assert!(prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        43,
        43
    ));
    assert!(!prop_site_is_clear(
        &sim.grid,
        &occupied,
        BuildingKind::Garden,
        -1,
        30
    ));
}

#[test]
fn repeated_prop_scattering_never_stacks_same_tick_or_later_props() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(706);
    sim.buildings.clear();
    sim.organisms.clear();
    for y in 20..60 {
        for x in 20..60 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for clan in ["first", "second"] {
        for i in 0..3 {
            sim.organisms
                .push(test_org(&format!("{clan}-{i}"), "Resident", clan, 40.0, 40.0));
        }
    }
    for _ in 0..30 {
        tick_scatter_props(&mut sim);
    }
    assert!(!sim.buildings.is_empty());
    let mut occupied = HashSet::default();
    for b in &sim.buildings {
        for tile in footprint_cells(b.kind, b.x, b.y) {
            assert!(occupied.insert(tile), "overlapping prop at {tile:?}");
        }
    }
}

#[test]
fn automatic_homes_leave_lanes_but_exact_placement_can_connect_walls() {
    let mut sim = Simulation::new(704);
    sim.buildings.clear();
    sim.buildings
        .push(Building::new(1, BuildingKind::House, 30, 30, None, 0));
    assert!(!automatic_site_has_clearance(&sim, BuildingKind::House, 32, 30));
    assert!(!automatic_site_has_clearance(&sim, BuildingKind::House, 30, 33));
    assert!(automatic_site_has_clearance(&sim, BuildingKind::House, 33, 30));
    assert!(automatic_site_has_clearance(&sim, BuildingKind::Wall, 32, 30));
}

#[test]
fn small_settlements_finish_existing_projects_before_starting_more() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(705);
    sim.buildings.clear();
    sim.organisms.clear();
    for y in 20..60 {
        for x in 20..60 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for i in 0..4 {
        let mut worker = test_org(&format!("worker-{i}"), "Worker", "clan", 40.0, 40.0);
        worker.age = worker.max_age / 2;
        worker.inv_wood = 100;
        worker.inv_stone = 100;
        worker.wealth = 1000;
        sim.organisms.push(worker);
    }
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        40,
        40,
        Some("clan".into()),
        0,
    ));
    let wood = sim.organisms[0].inv_wood;
    tick_buildings_construct(&mut sim);
    assert_eq!(sim.buildings.len(), 1);
    assert_eq!(sim.organisms[0].inv_wood, wood);
}

#[test]
fn housing_demand_counts_pending_homes_but_not_ruins_or_scenery() {
    let mut sim = Simulation::new(703);
    sim.buildings.clear();
    let owner = sim.organisms[0].lineage_id.clone();
    sim.organisms[0].inv_wood = 100;
    sim.organisms[0].inv_stone = 100;
    sim.organisms[0].wealth = 1000;
    assert_eq!(
        housing_target(&sim, &owner, Era::Stone, 4),
        Some(BuildingKind::Hut)
    );
    let mut b = Building::new(1, BuildingKind::House, 30, 30, Some(owner.clone()), 0);
    sim.buildings.push(b.clone());
    assert_eq!(housing_target(&sim, &owner, Era::Bronze, 4), None);
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 8),
        Some(BuildingKind::House)
    );
    sim.buildings[0].damage = 1.0;
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 4),
        Some(BuildingKind::House)
    );
    b.decorative = true;
    sim.buildings.push(b);
    assert_eq!(
        housing_target(&sim, &owner, Era::Bronze, 4),
        Some(BuildingKind::House)
    );
    assert_eq!(housing_target(&sim, &owner, Era::PreStone, 4), None);
}

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
fn building_cap_prunes_scenery_without_erasing_civilization() {
    let mut sim = Simulation::new(0xB17D);
    sim.buildings.clear();

    let wonder = Building::new(1, BuildingKind::University, 10, 10, Some("lineage-a".into()), 1);
    let hospital = Building::new(2, BuildingKind::Hospital, 12, 10, Some("lineage-a".into()), 2);
    sim.buildings.push(wonder);
    sim.buildings.push(hospital);

    for id in 3..=1_600 {
        let mut prop = Building::new(
            id,
            BuildingKind::Bench,
            id as i32 % 100,
            id as i32 / 100,
            Some("lineage-a".into()),
            id as u64,
        );
        prop.condition = 1.0;
        prop.decorative = true;
        sim.buildings.push(prop);
    }

    cap_buildings(&mut sim);

    assert_eq!(sim.buildings.len(), 1_500);
    assert!(sim.buildings.iter().any(|building| building.id == 1));
    assert!(sim.buildings.iter().any(|building| building.id == 2));
}

#[test]
fn functional_building_budget_prevents_unbounded_world_growth() {
    let mut sim = Simulation::new(0xB01D);
    sim.buildings.clear();
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        sim.buildings.push(Building::new(
            id,
            BuildingKind::Hospital,
            id as i32 % 100,
            id as i32 / 100,
            Some("lineage-a".into()),
            id as u64,
        ));
    }
    for org in sim.organisms.iter_mut().filter(|org| org.alive) {
        org.lineage_id = "lineage-a".into();
    }

    tick_buildings_construct(&mut sim);

    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);
}

#[test]
fn abandoned_ruins_cannot_deadlock_the_functional_building_budget() {
    let mut sim = Simulation::new(0xB01E);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 240;
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        let mut ruin = Building::new(
            id,
            BuildingKind::Hospital,
            300 + id as i32 % 100,
            100 + id as i32 / 100,
            Some("extinct-lineage".into()),
            1,
        );
        ruin.condition = 1.0;
        ruin.damage = 1.0;
        sim.buildings.push(ruin);
    }
    sim.next_building_id = FUNCTIONAL_BUILDINGS_CAP as u32 + 1;

    let mut builder = test_org("builder", "Builder", "new-lineage", 10.0, 10.0);
    builder.age = builder.max_age / 2;
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);
    sim.grid.set(10, 10, crate::world::tiles::Tile::Grass);

    tick_buildings_construct(&mut sim);
    assert_eq!(
        sim.buildings.len(),
        FUNCTIONAL_BUILDINGS_CAP,
        "planning alone must not evict history before a funded project is selected"
    );
    assert!(try_start_building_at(
        &mut sim,
        "new-lineage",
        BuildingKind::Hut,
        10,
        10,
    ));
    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);
    assert!(sim
        .buildings
        .iter()
        .any(|building| building.kind == BuildingKind::Hut));
}

#[test]
fn failed_unfunded_construction_does_not_evict_abandoned_history() {
    let mut sim = Simulation::new(0xB020);
    sim.organisms.clear();
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 240;
    for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
        let mut ruin = Building::new(
            id,
            BuildingKind::Hospital,
            300 + id as i32 % 100,
            100 + id as i32 / 100,
            Some("extinct-lineage".into()),
            1,
        );
        ruin.condition = 1.0;
        ruin.damage = 1.0;
        sim.buildings.push(ruin);
    }
    let mut builder = test_org("builder", "Builder", "new-lineage", 10.0, 10.0);
    builder.age = builder.max_age / 2;
    builder.inv_wood = 0;
    builder.inv_stone = 0;
    builder.wealth = 0;
    sim.organisms.push(builder);
    sim.grid.set(10, 10, crate::world::tiles::Tile::Grass);

    assert!(!try_start_building_at(
        &mut sim,
        "new-lineage",
        BuildingKind::Hut,
        10,
        10,
    ));
    assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);

    tick_buildings_construct(&mut sim);
    assert_eq!(
        sim.buildings.len(),
        FUNCTIONAL_BUILDINGS_CAP,
        "autonomous planning must also preserve ruins until a funded project succeeds"
    );
}

#[test]
fn active_rebuilds_and_ruined_wonders_are_never_abandoned() {
    let mut sim = Simulation::new(0xB01F);
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 1_000;

    let mut rebuilding = Building::new(1, BuildingKind::House, 10, 10, Some("lineage-a".into()), 1);
    rebuilding.condition = 1.0;
    rebuilding.damage = 0.8;
    rebuilding.ruined_at_tick = Some(1);
    rebuilding.last_repair_tick = Some(sim.tick_count - REPAIR_GRACE_TICKS);
    sim.buildings.push(rebuilding);

    let mut wonder = Building::new(2, BuildingKind::University, 20, 20, Some("lineage-a".into()), 1);
    wonder.condition = 1.0;
    wonder.damage = 1.0;
    wonder.ruined_at_tick = Some(1);
    sim.buildings.push(wonder);

    assert_eq!(prune_abandoned_ruins(&mut sim, usize::MAX), 0);
    assert_eq!(sim.buildings.len(), 2);
}

#[test]
fn old_ruins_persist_when_the_world_is_not_under_capacity_pressure() {
    let mut sim = Simulation::new(0xB021);
    sim.buildings.clear();
    sim.tick_count = RUIN_RETENTION_TICKS + 1_000;
    let mut ruin = Building::new(1, BuildingKind::House, 10, 10, None, 1);
    ruin.condition = 1.0;
    ruin.damage = 1.0;
    ruin.ruined_at_tick = Some(1);
    sim.buildings.push(ruin);

    cap_buildings(&mut sim);

    assert_eq!(sim.buildings.len(), 1);
    assert!(sim.buildings[0].is_ruined());
}

#[test]
fn building_population_gates_are_reachable_at_every_supported_world_size() {
    let authored_gates = [
        3usize, 6, 8, 10, 12, 15, 18, 22, 25, 30, 40, 45, 60, 70, 100, 120, 140, 160, 180, 220, 240, 450,
    ];
    for population_limit in [120, 350, 500, 1_000, 2_000, 5_000] {
        let lineage_capacity = natural_lineage_limit(population_limit).min(BASELINE_MAX_BUILDING_REQUIREMENT);
        let requirements: Vec<usize> = authored_gates
            .iter()
            .map(|base| construction_population_requirement(*base, population_limit))
            .collect();
        assert!(requirements.windows(2).all(|pair| pair[0] <= pair[1]));
        assert_eq!(requirements.last().copied(), Some(lineage_capacity));

        let existing: HashSet<BuildingKind> = BuildingKind::all()
            .iter()
            .copied()
            .filter(|kind| *kind != BuildingKind::Megastructure)
            .collect();
        assert_eq!(
            next_target_building(Era::Galactic, lineage_capacity, population_limit, &existing),
            Some(BuildingKind::Megastructure),
            "Galactic construction should remain reachable at cap {population_limit}"
        );
    }
    assert_eq!(construction_population_requirement(40, 350), 40);
}

#[test]
fn devout_tribes_raise_a_place_of_worship_first() {
    let mut sim = Simulation::new(3);
    let lid = sim.organisms[0].lineage_id.clone();
    let none = HashSet::default();
    assert_eq!(
        devout_target(&sim, &lid, Era::Stone, 10, &none),
        None,
        "not devout yet"
    );
    sim.prayers.faith.insert(lid.clone(), DEVOUT_FAITH);
    assert_eq!(
        devout_target(&sim, &lid, Era::Stone, 10, &none),
        Some(BuildingKind::Shrine)
    );
    assert_eq!(
        devout_target(&sim, &lid, Era::Bronze, 40, &none),
        Some(BuildingKind::Temple)
    );
    let mut has_shrine = HashSet::default();
    has_shrine.insert(BuildingKind::Shrine);
    assert_eq!(devout_target(&sim, &lid, Era::Bronze, 40, &has_shrine), None);
    assert_eq!(construction_population_requirement(100, 350), 60);
    assert_eq!(construction_population_requirement(240, 500), 240);
}

#[test]
fn construction_reservation_is_atomic_and_charges_materials_and_wealth() {
    let mut sim = Simulation::new(0xC057);
    sim.organisms.clear();
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    let cost = BuildingKind::Factory.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth.saturating_sub(1);
    sim.organisms.push(builder);

    assert!(!reserve_construction_cost(
        &mut sim,
        "lineage-a",
        BuildingKind::Factory
    ));
    assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
    assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);

    sim.organisms[0].wealth = cost.wealth;
    assert!(reserve_construction_cost(
        &mut sim,
        "lineage-a",
        BuildingKind::Factory
    ));
    assert_eq!(sim.organisms[0].inv_wood, 0);
    assert_eq!(sim.organisms[0].inv_stone, 0);
    assert_eq!(sim.organisms[0].wealth, 0);
}

#[test]
fn invalid_construction_site_does_not_charge_the_lineage() {
    let mut sim = Simulation::new(0x51_7E);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);

    assert!(!try_start_building(
        &mut sim,
        "lineage-a",
        BuildingKind::Hut,
        -1_000,
        -1_000,
    ));
    assert!(sim.buildings.is_empty());
    assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
    assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);
    assert_eq!(sim.organisms[0].wealth, cost.wealth);
}

#[test]
fn fallback_construction_site_remains_within_worker_reach() {
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x51_7F);
    sim.organisms.clear();
    sim.buildings.clear();
    for y in 5..=15 {
        for x in 5..=35 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
    builder.age = 10_000;
    let cost = BuildingKind::Hut.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);
    sim.buildings.push(Building::new(
        900,
        BuildingKind::Hut,
        28,
        10,
        Some("lineage-b".into()),
        0,
    ));

    assert!(try_start_building(
        &mut sim,
        "lineage-a",
        BuildingKind::Hut,
        28,
        10,
    ));
    let project = sim
        .buildings
        .iter()
        .find(|building| building.owner_lineage.as_deref() == Some("lineage-a"))
        .expect("reachable fallback project");
    let distance =
        (project.x as f32 - sim.organisms[0].x).abs() + (project.y as f32 - sim.organisms[0].y).abs();
    assert!(distance <= CONSTRUCTION_WORKER_REACH);
}

#[test]
fn builders_walk_to_the_site_before_contributing_labor() {
    let mut sim = Simulation::new(704);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("builder", "Builder", "lineage-a", 20.0, 10.0);
    worker.age = 10_000;
    sim.organisms.push(worker);
    sim.grid.set(9, 10, crate::world::tiles::Tile::Grass);
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));
    tick_building_progress(&mut sim);
    assert_eq!(sim.buildings[0].condition, 0.0);
    assert!(sim.organisms[0].journey.is_some());
    sim.organisms[0].x = 9.0;
    tick_building_progress(&mut sim);
    assert!(sim.buildings[0].condition > 0.0);
    assert!(sim.organisms[0].thought.contains("building a hut"));
}

#[test]
fn a_lone_crew_works_the_school_before_older_huts_and_wonders() {
    let mut sim = Simulation::new(0x5C01);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("worker", "Worker", "lineage-a", 10.0, 10.0);
    worker.age = 10_000;
    sim.organisms.push(worker);
    // The hut was started first and sits first in the list.
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.buildings.push(Building::new(
        2,
        BuildingKind::School,
        11,
        10,
        Some("lineage-a".into()),
        0,
    ));
    sim.tick_count = 20;
    tick_building_progress(&mut sim);
    assert!(sim.buildings[1].condition > 0.0, "the school got no crew");
    assert_eq!(sim.buildings[0].condition, 0.0, "the hut took the only worker");
}

#[test]
fn the_research_building_a_tribe_lacks_is_always_next() {
    let mut have: HashSet<BuildingKind> = HashSet::default();
    for expect in [
        BuildingKind::School,
        BuildingKind::Library,
        BuildingKind::Observatory,
        BuildingKind::University,
    ] {
        assert_eq!(research_target(Era::Renaissance, 45, 350, &have), Some(expect));
        have.insert(expect);
    }
    assert_eq!(research_target(Era::Renaissance, 45, 350, &have), None);
    assert_eq!(research_target(Era::Iron, 45, 350, &HashSet::default()), None);
}

#[test]
fn construction_stalls_without_active_workers_then_completes_with_labor() {
    let mut sim = Simulation::new(0x1AB0);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut worker = test_org("worker", "Worker", "lineage-a", 50.0, 50.0);
    worker.age = 10_000;
    worker.specialty = Some("builder".into());
    sim.organisms.push(worker);
    sim.buildings.push(Building::new(
        1,
        BuildingKind::Hut,
        10,
        10,
        Some("lineage-a".into()),
        0,
    ));

    tick_building_progress(&mut sim);
    assert_eq!(sim.buildings[0].condition, 0.0);
    assert!(sim.buildings[0].occupants.is_empty());

    sim.organisms[0].x = 10.0;
    sim.organisms[0].y = 10.0;
    let starting_energy = sim.organisms[0].energy;
    for tick in 1..=10 {
        sim.tick_count = tick * 20;
        tick_building_progress(&mut sim);
        if sim.buildings[0].is_complete() {
            break;
        }
    }
    assert!(sim.buildings[0].is_complete());
    assert_eq!(sim.buildings[0].built_at_tick, sim.tick_count);
    assert!(sim.buildings[0].occupants.is_empty());
    assert!(sim.organisms[0].energy < starting_energy);
    assert!(sim
        .events
        .iter()
        .any(|event| event.etype == "built" && event.detail.contains("hut")));
}

#[test]
fn completed_housing_is_shelter_and_unfinished_projects_are_not() {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x005E_17E2);
    sim.organisms.clear();
    sim.buildings.clear();
    let resident = test_org("resident", "Resident", "lineage-a", 80.0, 80.0);
    sim.organisms.push(resident);
    for y in 75..=85 {
        for x in 75..=85 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(x, y)] = 0.0;
        }
    }

    let mut hut = Building::new(1, BuildingKind::Hut, 81, 80, Some("lineage-a".into()), 0);
    hut.condition = 0.99;
    sim.buildings.push(hut);

    assert!(!sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
    assert!(sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

    sim.buildings[0].condition = 1.0;
    assert!(sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
    assert!(!sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-shelter-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
    let loaded_resident = loaded
        .organisms
        .iter()
        .find(|org| org.id == "resident")
        .expect("resident survives save/load");
    assert!(loaded_resident.near_shelter(&loaded.grid, &loaded.buildings));

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn bridge_requires_a_crossing_and_only_changes_terrain_on_completion() {
    use crate::world::grid::{TrailKind, WorldGrid};
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x00B2_1D6E);
    sim.organisms.clear();
    sim.buildings.clear();
    let (x, y) = (120, 120);
    for tile_y in y - 2..=y + 4 {
        for tile_x in x - 2..=x + 8 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
            sim.grid.structure[WorldGrid::idx(tile_x, tile_y)] = 0.0;
        }
    }
    sim.grid.set(x + 1, y, Tile::Water);
    sim.grid.set(x + 2, y, Tile::Water);
    sim.grid.depth[WorldGrid::idx(x + 1, y)] = 0.8;
    sim.grid.depth[WorldGrid::idx(x + 2, y)] = 0.7;

    let mut builder = test_org("bridge-builder", "Builder", "lineage-a", x as f32, y as f32);
    builder.age = 10_000;
    builder.energy = 1.0;
    let cost = BuildingKind::Bridge.construction_cost();
    builder.inv_wood = cost.wood as u8;
    builder.inv_stone = cost.stone as u8;
    builder.wealth = cost.wealth;
    sim.organisms.push(builder);

    assert!(construction_site_is_valid(&sim, BuildingKind::Bridge, x, y));
    assert!(!construction_site_is_valid(&sim, BuildingKind::Bridge, x, y + 2));
    assert!(!construction_site_is_valid(&sim, BuildingKind::Hut, x + 1, y));
    assert!(try_start_building_at(
        &mut sim,
        "lineage-a",
        BuildingKind::Bridge,
        x,
        y
    ));
    assert_eq!(sim.grid.get(x + 1, y), Tile::Water);
    assert_eq!(sim.grid.trail_at(x + 1, y, TrailKind::Path), 0.0);

    sim.buildings[0].condition = 0.99;
    sim.tick_count = 20;
    tick_building_progress(&mut sim);

    assert!(sim.buildings[0].is_operational());
    for tile_x in x..=x + 3 {
        assert_eq!(sim.grid.trail_at(tile_x, y, TrailKind::Path), 5.0);
    }
    for tile_x in x + 1..=x + 2 {
        assert_eq!(sim.grid.get(tile_x, y), Tile::Sand);
        assert_eq!(sim.grid.depth_at(tile_x, y), 0.0);
        assert!(sim.grid.get(tile_x, y).walkable());
    }

    let mut path = std::env::temp_dir();
    path.push(format!(
        "thehumanbox-bridge-save-test-{}.json",
        std::process::id()
    ));
    let path_s = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));

    sim.save_result(&path_s).unwrap();
    let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
    assert!(loaded
        .buildings
        .iter()
        .any(|building| building.kind == BuildingKind::Bridge && building.is_operational()));
    assert_eq!(loaded.grid.get(x + 1, y), Tile::Sand);
    assert!(loaded.grid.trail_at(x + 1, y, TrailKind::Path) > 0.0);

    let _ = std::fs::remove_file(&path_s);
    let _ = std::fs::remove_file(format!("{}.tmp", path_s));
}

#[test]
fn operational_infrastructure_recovers_after_hydrology_changes() {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(0x1AF2_A57A);
    sim.buildings.clear();
    let (bridge_x, bridge_y) = (140, 140);
    for tile_y in bridge_y - 2..=bridge_y + 6 {
        for tile_x in bridge_x - 2..=bridge_x + 8 {
            sim.grid.set(tile_x, tile_y, Tile::Grass);
        }
    }

    let mut bridge = Building::new(
        1,
        BuildingKind::Bridge,
        bridge_x,
        bridge_y,
        Some("lineage-a".into()),
        1,
    );
    bridge.condition = 1.0;
    sim.buildings.push(bridge);
    sim.grid.set(bridge_x + 1, bridge_y, Tile::Water);
    sim.grid.set(bridge_x + 2, bridge_y, Tile::Flooded);
    sim.grid.depth[WorldGrid::idx(bridge_x + 1, bridge_y)] = 0.8;
    sim.grid.depth[WorldGrid::idx(bridge_x + 2, bridge_y)] = 0.6;

    let well_x = bridge_x;
    let well_y = bridge_y + 3;
    let mut well = Building::new(2, BuildingKind::Well, well_x, well_y, Some("lineage-a".into()), 1);
    well.condition = 1.0;
    sim.buildings.push(well);
    sim.grid.set(well_x, well_y, Tile::Grass);
    sim.grid.depth[WorldGrid::idx(well_x, well_y)] = 0.9;

    let unfinished_x = well_x + 3;
    let mut unfinished_well = Building::new(
        3,
        BuildingKind::Well,
        unfinished_x,
        well_y,
        Some("lineage-a".into()),
        1,
    );
    unfinished_well.condition = 0.99;
    sim.buildings.push(unfinished_well);
    sim.grid.set(unfinished_x, well_y, Tile::Grass);

    reconcile_operational_infrastructure(&mut sim);

    for tile_x in bridge_x..bridge_x + 4 {
        assert!(sim.grid.get(tile_x, bridge_y).walkable());
        assert_eq!(sim.grid.depth_at(tile_x, bridge_y), 0.0);
    }
    assert_eq!(sim.grid.get(well_x, well_y), Tile::Water);
    assert_eq!(sim.grid.depth_at(well_x, well_y), 0.0);
    assert_eq!(sim.grid.get(unfinished_x, well_y), Tile::Grass);
}

#[test]
fn incomplete_buildings_grant_no_aura() {
    let mut sim = Simulation::new(0xA0AA);
    sim.organisms.clear();
    sim.buildings.clear();
    let mut patient = test_org("patient", "Patient", "lineage-a", 10.0, 10.0);
    patient.infection = 0.8;
    patient.health = 0.5;
    sim.organisms.push(patient);
    let mut hospital = Building::new(1, BuildingKind::Hospital, 10, 10, Some("lineage-a".into()), 0);
    hospital.condition = 0.99;
    sim.buildings.push(hospital);

    tick_building_auras(&mut sim);
    assert_eq!(sim.organisms[0].infection, 0.8);
    assert_eq!(sim.organisms[0].health, 0.5);

    sim.buildings[0].condition = 1.0;
    tick_building_auras(&mut sim);
    assert!(sim.organisms[0].infection < 0.8);
    assert!(sim.organisms[0].health > 0.5);

    sim.organisms[0].infection = 0.8;
    sim.organisms[0].health = 0.5;
    sim.buildings[0].decorative = true;
    tick_building_auras(&mut sim);
    assert_eq!(sim.organisms[0].infection, 0.8);
    assert_eq!(sim.organisms[0].health, 0.5);
}
