use std::collections::HashSet;

use crate::sim::age_stage::AgeStage;
use crate::sim::buildings::{Building, BuildingKind, REPAIR_ACTIVITY_TICKS};
use crate::sim::simulation::Simulation;
use crate::sim::warfare::BattleScale;
use crate::sim::world_events::push_event;
use crate::world::tiles::Tile;

const DAMAGE_TICK_INTERVAL: u64 = 5;
const REPAIR_TICK_INTERVAL: u64 = 20;
const REPAIR_TICK_OFFSET: u64 = 10;
const REPAIR_REACH: f32 = 18.0;
const RUIN_REOPEN_DAMAGE: f32 = 0.001;
const FIRE_STATION_RANGE: i32 = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DamageCause {
    Fire,
    Flood,
    Storm,
    Battle,
}

impl DamageCause {
    fn label(self) -> &'static str {
        match self {
            Self::Fire => "fire",
            Self::Flood => "flooding",
            Self::Storm => "a storm",
            Self::Battle => "battle",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Exposure {
    amount: f32,
    cause: DamageCause,
}

#[derive(Clone, Copy)]
struct RepairPlan {
    wood: u32,
    stone: u32,
    wealth: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RepairUnit {
    Wood,
    Stone,
    Wealth,
}

fn supports_damage(kind: BuildingKind) -> bool {
    // These two completion effects permanently rewrite terrain. They need an
    // original-terrain record before destruction can be represented honestly.
    !matches!(kind, BuildingKind::Bridge | BuildingKind::Well)
}

fn repair_plan(kind: BuildingKind) -> RepairPlan {
    let construction = kind.construction_cost();
    RepairPlan {
        wood: u32::from(construction.wood).div_ceil(2),
        stone: u32::from(construction.stone).div_ceil(2),
        wealth: construction.wealth.div_ceil(2),
    }
}

impl RepairPlan {
    fn total_units(self) -> u32 {
        self.wood + self.stone + self.wealth
    }

    fn next_unit(self, damage: f32) -> Option<RepairUnit> {
        let total = self.total_units();
        if total == 0 {
            return None;
        }
        // Derive the next bill item from remaining damage rather than
        // accumulating a separate cursor. The epsilon keeps exact unit
        // boundaries stable across f32 subtraction (for example 2/3 * 3).
        let remaining_units = (damage.clamp(0.0, 1.0) * total as f32 - 0.000_1)
            .ceil()
            .clamp(1.0, total as f32) as u32;
        let repaired_units = total.saturating_sub(remaining_units);
        let index = repaired_units.min(total - 1);
        if index < self.wood {
            Some(RepairUnit::Wood)
        } else if index < self.wood + self.stone {
            Some(RepairUnit::Stone)
        } else {
            Some(RepairUnit::Wealth)
        }
    }
}

fn can_repair(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.age_stage() == AgeStage::Adult && org.energy > 0.20 && org.health > 0.25
}

fn pooled_resource_available(sim: &Simulation, lineage: &str, unit: RepairUnit) -> bool {
    sim.organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .any(|org| match unit {
            RepairUnit::Wood => org.inv_wood > 0,
            RepairUnit::Stone => org.inv_stone > 0,
            RepairUnit::Wealth => org.wealth > 0,
        })
}

fn consume_pooled_resource(sim: &mut Simulation, lineage: &str, unit: RepairUnit) {
    let org = sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .find(|org| match unit {
            RepairUnit::Wood => org.inv_wood > 0,
            RepairUnit::Stone => org.inv_stone > 0,
            RepairUnit::Wealth => org.wealth > 0,
        })
        .expect("resource availability checked before repair payment");
    match unit {
        RepairUnit::Wood => org.inv_wood -= 1,
        RepairUnit::Stone => org.inv_stone -= 1,
        RepairUnit::Wealth => org.wealth -= 1,
    }
}

fn battle_damage(scale: BattleScale) -> f32 {
    match scale {
        BattleScale::Skirmish => 0.001,
        BattleScale::Raid => 0.002,
        BattleScale::Siege => 0.0075,
        BattleScale::Battle => 0.0045,
        BattleScale::War => 0.006,
    }
}

fn exposure_for(
    sim: &Simulation,
    building: &Building,
    fire_stations: &[(Option<&str>, i32, i32)],
) -> Option<Exposure> {
    let (width, height) = building.footprint();
    let mut strongest_fire = 0.0f32;
    let mut flooded = 0u32;
    let footprint_area = u32::from(width) * u32::from(height);
    for tile_y in building.y..building.y + i32::from(height) {
        for tile_x in building.x..building.x + i32::from(width) {
            match sim.grid.get(tile_x, tile_y) {
                Tile::Fire => {
                    strongest_fire = strongest_fire.max(sim.grid.fire_intensity(tile_x, tile_y).max(0.35));
                }
                Tile::Flooded => flooded += 1,
                _ => {}
            }
        }
    }

    let protected_by_station = fire_stations.iter().any(|(owner, x, y)| {
        *owner == building.owner_lineage.as_deref()
            && (building.x - *x).abs() + (building.y - *y).abs() <= FIRE_STATION_RANGE
    });
    if strongest_fire > 0.0 {
        let protection = if protected_by_station { 0.35 } else { 1.0 };
        return Some(Exposure {
            amount: (0.030 * strongest_fire * protection).clamp(0.003, 0.04),
            cause: DamageCause::Fire,
        });
    }

    if flooded > 0 {
        return Some(Exposure {
            amount: (0.018 * flooded as f32 / footprint_area.max(1) as f32).max(0.004),
            cause: DamageCause::Flood,
        });
    }

    let center = (
        building.x + i32::from(width) / 2,
        building.y + i32::from(height) / 2,
    );
    if let Some(amount) = sim
        .battles
        .iter()
        .filter(|battle| battle.ended_tick.is_none())
        .filter_map(|battle| {
            let distance = (center.0 - battle.location.0).abs() + (center.1 - battle.location.1).abs();
            (distance <= 7).then_some(battle_damage(battle.scale))
        })
        .max_by(|a, b| a.total_cmp(b))
    {
        return Some(Exposure {
            amount,
            cause: DamageCause::Battle,
        });
    }

    // Storm exposure is sparse and deterministic, so a storm leaves a path of
    // damage instead of shaving health from every building in the world.
    if sim.weather.kind == 2
        && sim.weather.effective_intensity(sim.tick_count) > 0.55
        && (u64::from(building.id).wrapping_mul(17) + sim.tick_count / DAMAGE_TICK_INTERVAL)
            .is_multiple_of(11)
    {
        return Some(Exposure {
            amount: 0.006 * sim.weather.effective_intensity(sim.tick_count),
            cause: DamageCause::Storm,
        });
    }

    None
}

fn apply_damage(sim: &mut Simulation) -> HashSet<usize> {
    let fire_stations: Vec<(Option<&str>, i32, i32)> = sim
        .buildings
        .iter()
        .filter(|building| building.is_operational() && building.kind == BuildingKind::FireStation)
        .map(|building| (building.owner_lineage.as_deref(), building.x, building.y))
        .collect();
    let exposures: Vec<(usize, Exposure)> = sim
        .buildings
        .iter()
        .enumerate()
        .filter(|(_, building)| {
            building.is_complete() && !building.decorative && supports_damage(building.kind)
        })
        .filter_map(|(index, building)| {
            exposure_for(sim, building, &fire_stations).map(|exposure| (index, exposure))
        })
        .collect();

    let mut exposed = HashSet::new();
    let mut ruined_events = Vec::new();
    for (index, exposure) in exposures {
        exposed.insert(index);
        let building = &mut sim.buildings[index];
        let was_ruined = building.is_ruined();
        building.damage = (building.damage_fraction() + exposure.amount).min(1.0);
        building.last_damage_tick = Some(sim.tick_count);
        if !was_ruined && building.damage_fraction() >= 1.0 {
            building.ruined_at_tick = Some(sim.tick_count);
            ruined_events.push((
                building
                    .owner_lineage
                    .clone()
                    .unwrap_or_else(|| "world".to_string()),
                building.kind,
                building.x,
                building.y,
                exposure.cause,
            ));
        }
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }

    for (lineage, kind, x, y, cause) in ruined_events {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "building_ruined",
            &lineage,
            &format!("{} at ({},{}) was ruined by {}", kind.name(), x, y, cause.label()),
        );
        let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
        sim.headlines.push_back((
            sim.tick_count,
            format!(
                "\u{1F525} A {} of the {} fell to {}.",
                kind.name(),
                lineage_name,
                cause.label()
            ),
        ));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
    exposed
}

fn apply_repairs(sim: &mut Simulation, exposed: &HashSet<usize>) {
    let mut assigned_workers = HashSet::new();
    let mut restored_events = Vec::new();

    for building_index in 0..sim.buildings.len() {
        if exposed.contains(&building_index) {
            continue;
        }
        let building = &sim.buildings[building_index];
        if !building.is_complete()
            || building.decorative
            || !building.is_damaged()
            || !supports_damage(building.kind)
        {
            continue;
        }
        let Some(lineage) = building.owner_lineage.clone() else {
            continue;
        };
        let (x, y, kind) = (building.x, building.y, building.kind);
        let Some(worker_index) = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(index, _)| !assigned_workers.contains(index))
            .filter(|(_, org)| org.lineage_id == lineage && can_repair(org))
            .filter_map(|(index, org)| {
                let distance = (org.x - x as f32).abs() + (org.y - y as f32).abs();
                (distance <= REPAIR_REACH).then_some((distance, index))
            })
            .min_by(|(distance_a, index_a), (distance_b, index_b)| {
                distance_a
                    .total_cmp(distance_b)
                    .then_with(|| index_a.cmp(index_b))
            })
            .map(|(_, index)| index)
        else {
            continue;
        };
        let plan = repair_plan(kind);
        let Some(unit) = plan.next_unit(building.damage_fraction()) else {
            continue;
        };
        if !pooled_resource_available(sim, &lineage, unit) {
            continue;
        }
        let repair_amount = 1.0 / plan.total_units() as f32;

        consume_pooled_resource(sim, &lineage, unit);
        assigned_workers.insert(worker_index);
        sim.organisms[worker_index].energy = (sim.organisms[worker_index].energy - 0.008).max(0.0);

        let building = &mut sim.buildings[building_index];
        let was_ruined = building.is_ruined();
        if was_ruined && building.ruined_at_tick.is_none() {
            // Damage at 100% is independently recognized as a ruin. Latch
            // that state before the first repair so one paid unit cannot make
            // an imported or command-authored ruin operational immediately.
            building.ruined_at_tick = Some(building.last_damage_tick.unwrap_or(sim.tick_count));
        }
        building.damage = (building.damage_fraction() - repair_amount).max(0.0);
        building.last_repair_tick = Some(sim.tick_count);
        if was_ruined && building.damage_fraction() <= RUIN_REOPEN_DAMAGE {
            building.ruined_at_tick = None;
            restored_events.push((lineage, kind, x, y));
        }
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }

    for (lineage, kind, x, y) in restored_events {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "building_restored",
            &lineage,
            &format!("rebuilt the {} ruins at ({},{})", kind.name(), x, y),
        );
        let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
        sim.headlines.push_back((
            sim.tick_count,
            format!(
                "\u{1F6E0}\u{FE0F} The {} rebuilt their {} from the ruins.",
                lineage_name,
                kind.name()
            ),
        ));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

pub(crate) fn tick_building_damage(sim: &mut Simulation) {
    if sim.tick_count == 0 || !sim.tick_count.is_multiple_of(DAMAGE_TICK_INTERVAL) {
        return;
    }
    // Repairing is a short activity animation derived from timestamps rather
    // than a persisted toggle. Publish the exact cadence where it expires so
    // hot/incremental clients do not retain a stale rebuilding state until the
    // next periodic full snapshot.
    let repair_activity_expired = sim.buildings.iter().any(|building| {
        building.is_complete()
            && !building.decorative
            && building.is_damaged()
            && building.last_repair_tick.is_some_and(|repair_tick| {
                repair_tick >= building.last_damage_tick.unwrap_or(0)
                    && sim.tick_count.saturating_sub(repair_tick) > REPAIR_ACTIVITY_TICKS
                    && sim.tick_count.saturating_sub(repair_tick)
                        <= REPAIR_ACTIVITY_TICKS + DAMAGE_TICK_INTERVAL
            })
    });
    if repair_activity_expired {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    let exposed = apply_damage(sim);
    if sim.tick_count % REPAIR_TICK_INTERVAL == REPAIR_TICK_OFFSET {
        apply_repairs(sim, &exposed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn completed_house(sim: &mut Simulation, x: i32, y: i32) -> usize {
        let lineage = sim.organisms[0].lineage_id.clone();
        let mut building = Building::new(900, BuildingKind::House, x, y, Some(lineage), 1);
        building.condition = 1.0;
        sim.buildings.push(building);
        sim.buildings.len() - 1
    }

    fn completed_building(sim: &mut Simulation, id: u32, kind: BuildingKind, x: i32, y: i32) -> usize {
        let lineage = sim.organisms[0].lineage_id.clone();
        let mut building = Building::new(id, kind, x, y, Some(lineage), 1);
        building.condition = 1.0;
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
        assert!(
            (sim.buildings[besieged].damage_fraction() - battle_damage(BattleScale::Siege)).abs() < 0.000_01
        );
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
}
