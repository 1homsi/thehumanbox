use super::*;

/// Buildings stand on dry ground; standing water on a footprint is
/// flooding.
fn dry_footprint(sim: &mut Simulation, building: &Building) {
    let (w, h) = building.footprint();
    for ty in building.y..building.y + i32::from(h) {
        for tx in building.x..building.x + i32::from(w) {
            if matches!(sim.grid.get(tx, ty), Tile::Water | Tile::Flooded) {
                sim.grid.set(tx, ty, Tile::Grass);
            }
        }
    }
}

fn completed_house(sim: &mut Simulation, x: i32, y: i32) -> usize {
    let lineage = sim.organisms[0].lineage_id.clone();
    let mut building = Building::new(900, BuildingKind::House, x, y, Some(lineage), 1);
    building.condition = 1.0;
    dry_footprint(sim, &building);
    sim.buildings.push(building);
    sim.buildings.len() - 1
}

fn completed_building(sim: &mut Simulation, id: u32, kind: BuildingKind, x: i32, y: i32) -> usize {
    let lineage = sim.organisms[0].lineage_id.clone();
    let mut building = Building::new(id, kind, x, y, Some(lineage), 1);
    building.condition = 1.0;
    dry_footprint(sim, &building);
    sim.buildings.push(building);
    sim.buildings.len() - 1
}

fn prepare_worker(sim: &mut Simulation, x: i32, y: i32) {
    let worker = &mut sim.organisms[0];
    worker.alive = true;
    worker.age = worker.max_age / 2;
    worker.energy = 1.0;
    worker.health = 1.0;
    worker.x = x as f32;
    worker.y = y as f32;
}

#[test]
fn unmaintained_houses_age_into_ruins_and_stone_wonders_last_longer() {
    let mut sim = Simulation::new(701);
    sim.buildings.clear();
    sim.organisms.clear();
    sim.weather.kind = 0;
    for (id, kind, x) in [(1, BuildingKind::House, 30), (2, BuildingKind::Castle, 40)] {
        let mut b = Building::new(id, kind, x, 30, None, 0);
        b.condition = 1.0;
        let (w, h) = b.footprint();
        for y in 30..30 + i32::from(h) {
            for xx in x..x + i32::from(w) {
                sim.grid.set(xx, y, Tile::Grass);
            }
        }
        sim.buildings.push(b);
    }
    // Drive just the once-daily lifecycle, not millions of unrelated AI ticks.
    for day in 1..=201 * crate::sim::cosmos::YEAR_LENGTH_DAYS {
        sim.tick_count = day * crate::sim::cosmos::DAY_LENGTH;
        tick_building_damage(&mut sim);
    }
    assert!(sim.buildings[0].is_ruined());
    assert!(!sim.buildings[1].is_ruined());
    assert!(sim.buildings[1].damage_fraction() > 0.3);
}

#[test]
fn a_new_lineage_can_pay_to_reclaim_an_abandoned_ruin() {
    let mut sim = Simulation::new(702);
    sim.buildings.clear();
    let i = completed_house(&mut sim, 30, 30);
    sim.buildings[i].owner_lineage = Some("extinct-lineage".into());
    sim.buildings[i].damage = 1.0;
    sim.buildings[i].ruined_at_tick = Some(1);
    prepare_worker(&mut sim, 30, 30);
    sim.organisms[0].inv_wood = 100;
    sim.organisms[0].inv_stone = 100;
    sim.organisms[0].wealth = 100;
    sim.tick_count = 10;
    apply_repairs(&mut sim, &HashSet::default());
    assert_eq!(
        sim.buildings[i].owner_lineage.as_deref(),
        Some(sim.organisms[0].lineage_id.as_str())
    );
    assert!(sim.buildings[i].damage < 1.0);
    assert!(sim.buildings[i].is_ruined());
    for _ in 0..repair_plan(BuildingKind::House).total_units() {
        sim.tick_count += REPAIR_TICK_INTERVAL;
        apply_repairs(&mut sim, &HashSet::default());
    }
    assert!(sim.buildings[i].is_operational());
    assert_eq!((sim.buildings[i].x, sim.buildings[i].y), (30, 30));
}

#[test]
fn active_fire_damages_and_eventually_ruins_a_building() {
    let mut sim = Simulation::new(77);
    sim.buildings.clear();
    let index = completed_house(&mut sim, 120, 120);
    sim.grid.set(120, 120, Tile::Fire);
    *sim.grid.fire_intensity_mut(120, 120) = 1.0;

    for step in 1..=40 {
        sim.tick_count = step * DAMAGE_TICK_INTERVAL;
        tick_building_damage(&mut sim);
    }

    assert!(sim.buildings[index].is_ruined());
    assert!(!sim.buildings[index].is_operational());
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "building_ruined")
            .count(),
        1,
        "a persistent hazard must not repeat the ruin event"
    );
}

#[test]
fn only_active_hazards_on_the_footprint_damage_supported_buildings() {
    let mut sim = Simulation::new(771);
    sim.buildings.clear();
    let adjacent = completed_house(&mut sim, 100, 100);
    let campfire = completed_house(&mut sim, 110, 100);
    let bridge = completed_building(&mut sim, 901, BuildingKind::Bridge, 120, 100);
    let well = completed_building(&mut sim, 902, BuildingKind::Well, 130, 100);
    let decorative = completed_house(&mut sim, 140, 100);
    sim.buildings[decorative].decorative = true;
    let incomplete = completed_house(&mut sim, 150, 100);
    sim.buildings[incomplete].condition = 0.5;

    sim.grid.set(99, 100, Tile::Fire);
    *sim.grid.fire_intensity_mut(99, 100) = 1.0;
    sim.grid.set(110, 100, Tile::Campfire);
    for x in [120, 130, 140, 150] {
        sim.grid.set(x, 100, Tile::Fire);
        *sim.grid.fire_intensity_mut(x, 100) = 1.0;
    }
    sim.tick_count = DAMAGE_TICK_INTERVAL;
    tick_building_damage(&mut sim);

    for index in [adjacent, campfire, bridge, well, decorative, incomplete] {
        assert_eq!(
            sim.buildings[index].damage_fraction(),
            0.0,
            "{} should not have taken structural damage",
            sim.buildings[index].kind.name()
        );
    }
}

#[test]
fn an_operational_fire_station_reduces_same_lineage_fire_damage() {
    let mut sim = Simulation::new(772);
    sim.buildings.clear();
    let house = completed_house(&mut sim, 120, 120);
    completed_building(&mut sim, 902, BuildingKind::FireStation, 110, 120);
    sim.grid.set(120, 120, Tile::Fire);
    *sim.grid.fire_intensity_mut(120, 120) = 1.0;
    sim.tick_count = DAMAGE_TICK_INTERVAL;

    tick_building_damage(&mut sim);

    assert!((sim.buildings[house].damage_fraction() - 0.0105).abs() < 0.000_01);
}

#[test]
fn flood_storm_and_active_battles_leave_distinct_damage() {
    use crate::sim::warfare::{Battle, BattleScale};

    let mut sim = Simulation::new(773);
    sim.buildings.clear();
    let flooded = completed_building(&mut sim, 903, BuildingKind::House, 180, 120);
    let stormed = completed_building(&mut sim, 900, BuildingKind::House, 200, 120);
    let besieged = completed_building(&mut sim, 905, BuildingKind::House, 220, 120);
    sim.grid.set(180, 120, Tile::Flooded);
    sim.weather.kind = 2;
    sim.weather.start_tick = 0;
    sim.weather.duration = 1_000;
    sim.weather.intensity = 1.0;
    sim.battles.push(Battle {
        id: "damage-test".into(),
        attackers: vec!["attackers".into()],
        defenders: vec!["defenders".into()],
        attacker_orgs: Vec::new(),
        defender_orgs: Vec::new(),
        scale: BattleScale::Siege,
        location: (220, 120),
        started_tick: 1,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 10,
        initial_d: 10,
    });
    // Building 900's deterministic storm lane is active on step 12.
    sim.tick_count = 60;

    tick_building_damage(&mut sim);

    assert!(sim.buildings[flooded].damage_fraction() >= 0.004);
    assert!(sim.buildings[stormed].damage_fraction() > 0.0);
    assert!((sim.buildings[besieged].damage_fraction() - battle_damage(BattleScale::Siege)).abs() < 0.000_01);
}

#[test]
fn repair_crews_travel_before_spending_materials() {
    let mut sim = Simulation::new(703);
    sim.buildings.clear();
    sim.organisms.truncate(1);
    let index = completed_house(&mut sim, 130, 130);
    sim.buildings[index].damage = 0.5;
    prepare_worker(&mut sim, 120, 130);
    sim.organisms[0].inv_wood = 100;
    sim.organisms[0].inv_stone = 100;
    sim.organisms[0].wealth = 100;
    sim.grid.set(129, 130, Tile::Grass);
    sim.tick_count = REPAIR_TICK_OFFSET;
    apply_repairs(&mut sim, &HashSet::default());
    assert_eq!(sim.buildings[index].damage_fraction(), 0.5);
    assert_eq!(sim.organisms[0].inv_wood, 100);
    assert_eq!(sim.organisms[0].inv_stone, 100);
    assert_eq!(sim.organisms[0].wealth, 100);
    assert!(sim.organisms[0].journey.is_some());
    assert!(sim.organisms[0].thought.contains("going to repair"));
    prepare_worker(&mut sim, 129, 130);
    apply_repairs(&mut sim, &HashSet::default());
    assert!(sim.buildings[index].damage_fraction() < 0.5);
    assert!(sim.organisms[0].thought.contains("repairing"));
}

#[test]
fn repairs_require_a_nearby_worker_and_real_materials() {
    let mut sim = Simulation::new(78);
    sim.buildings.clear();
    let index = completed_house(&mut sim, 130, 130);
    sim.buildings[index].damage = 0.5;
    prepare_worker(&mut sim, 130, 130);
    sim.tick_count = REPAIR_TICK_OFFSET;

    tick_building_damage(&mut sim);
    assert_eq!(sim.buildings[index].damage_fraction(), 0.5);

    let plan = repair_plan(BuildingKind::House);
    let unit = plan.next_unit(sim.buildings[index].damage_fraction()).unwrap();
    match unit {
        RepairUnit::Wood => {
            sim.organisms[0].inv_wood = 1;
            sim.organisms[0].inv_stone = 0;
            sim.organisms[0].wealth = 0;
        }
        RepairUnit::Stone => {
            sim.organisms[0].inv_wood = 0;
            sim.organisms[0].inv_stone = 1;
            sim.organisms[0].wealth = 0;
        }
        RepairUnit::Wealth => {
            sim.organisms[0].inv_wood = 0;
            sim.organisms[0].inv_stone = 0;
            sim.organisms[0].wealth = 1;
        }
    }
    sim.tick_count += REPAIR_TICK_INTERVAL;
    tick_building_damage(&mut sim);

    assert!(sim.buildings[index].damage_fraction() < 0.5);
    match unit {
        RepairUnit::Wood => assert_eq!(sim.organisms[0].inv_wood, 0),
        RepairUnit::Stone => assert_eq!(sim.organisms[0].inv_stone, 0),
        RepairUnit::Wealth => assert_eq!(sim.organisms[0].wealth, 0),
    }
}

#[test]
fn repair_activity_expires_on_the_hot_wire_and_new_damage_cancels_it() {
    let mut sim = Simulation::new(781);
    sim.buildings.clear();
    let index = completed_house(&mut sim, 135, 135);
    sim.buildings[index].damage = 0.5;
    sim.buildings[index].last_damage_tick = Some(5);
    sim.buildings[index].last_repair_tick = Some(12);
    sim.tick_count = 50;
    assert!(sim.buildings[index].is_repairing_at(sim.tick_count));

    sim.tick_count = 55;
    let revision = sim.building_state_revision;
    tick_building_damage(&mut sim);
    assert!(!sim.buildings[index].is_repairing_at(sim.tick_count));
    assert_eq!(sim.building_state_revision, revision.wrapping_add(1));

    sim.buildings[index].last_damage_tick = Some(60);
    sim.buildings[index].last_repair_tick = Some(59);
    sim.tick_count = 60;
    assert!(
        !sim.buildings[index].is_repairing_at(sim.tick_count),
        "new hazard damage must override an older repair animation"
    );
}

#[test]
fn ruins_stay_closed_until_rebuilding_crosses_the_threshold() {
    let mut sim = Simulation::new(79);
    sim.buildings.clear();
    let index = completed_house(&mut sim, 140, 140);
    sim.buildings[index].damage = 1.0;
    sim.buildings[index].ruined_at_tick = Some(5);
    prepare_worker(&mut sim, 140, 140);
    let plan = repair_plan(BuildingKind::House);

    for step in 0..plan.total_units() {
        sim.organisms[0].inv_wood = u8::MAX;
        sim.organisms[0].inv_stone = u8::MAX;
        sim.organisms[0].wealth = 100;
        sim.tick_count = u64::from(step) * REPAIR_TICK_INTERVAL + REPAIR_TICK_OFFSET;
        tick_building_damage(&mut sim);
        if sim.buildings[index].damage_fraction() > RUIN_REOPEN_DAMAGE {
            assert!(!sim.buildings[index].is_operational());
        }
    }

    assert!(!sim.buildings[index].is_ruined());
    assert!(sim.buildings[index].is_operational());
    assert!(sim.events.iter().any(|event| event.etype == "building_restored"));
}

#[test]
fn full_damage_without_a_timestamp_still_latches_as_a_ruin() {
    let mut sim = Simulation::new(80);
    sim.buildings.clear();
    let index = completed_building(&mut sim, 906, BuildingKind::Factory, 145, 145);
    sim.buildings[index].damage = 1.0;
    prepare_worker(&mut sim, 145, 145);
    sim.organisms[0].inv_wood = u8::MAX;
    sim.organisms[0].inv_stone = u8::MAX;
    sim.organisms[0].wealth = 100;
    sim.tick_count = REPAIR_TICK_OFFSET;

    tick_building_damage(&mut sim);

    assert!(sim.buildings[index].damage_fraction() < 1.0);
    assert!(sim.buildings[index].ruined_at_tick.is_some());
    assert!(sim.buildings[index].is_ruined());
    assert!(!sim.buildings[index].is_operational());
}
