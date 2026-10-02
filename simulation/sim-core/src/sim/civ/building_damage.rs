use rustc_hash::FxHashSet as HashSet;

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
pub(crate) enum DamageCause {
    Fire,
    Flood,
    Storm,
    Battle,
    Age,
    Meteor,
    Lightning,
    Quake,
    Lava,
    Frost,
    Buried,
    Dragonfire,
}

impl DamageCause {
    fn label(self) -> &'static str {
        match self {
            Self::Fire => "fire",
            Self::Flood => "flooding",
            Self::Storm => "a storm",
            Self::Battle => "battle",
            Self::Age => "age and neglect",
            Self::Meteor => "a falling star",
            Self::Lightning => "lightning",
            Self::Quake => "an earthquake",
            Self::Lava => "lava",
            Self::Frost => "the weight of snow",
            Self::Buried => "the rising rock",
            Self::Dragonfire => "dragonfire",
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
    // NOTE: this table is *not* monotonic in `BattleScale::min_participants`
    // (Skirmish 2, Raid 6, Siege 10, Battle 20, War 40 -> 0.001, 0.002,
    // 0.0075, 0.0045, 0.006), so a 10-strong siege does more building damage
    // per interval than a 40-strong war. `exposure_for` max'es over nearby
    // battles, so the siege value wins whenever one is active.
    //
    // Left as-is deliberately: sieges are the scale whose purpose is breaking
    // structures, so a higher per-building rate for fewer participants may
    // well be intended specialisation rather than a balance slip. Rescaling it
    // is a design call that needs its own balance pass, and
    // `siege_damage_reaches_a_besieged_building` pins the current value.
    // Left as is on purpose rather than silently "fixed".
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
                // A home standing in a lake is as flooded as one in a puddle.
                Tile::Flooded | Tile::Water => flooded += 1,
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

    // Calendar-based wear is batched once a day, not once per organism or frame.
    // Repairs subtract wear, so a maintained building can outlive its nominal life.
    if sim.tick_count.is_multiple_of(crate::sim::cosmos::DAY_LENGTH)
        && sim.tick_count.saturating_sub(building.built_at_tick) >= crate::sim::cosmos::DAY_LENGTH
        && !building.is_ruined()
    {
        return Some(Exposure {
            amount: 1.0
                / (building.kind.service_life_years() as f32 * crate::sim::cosmos::YEAR_LENGTH_DAYS as f32),
            cause: DamageCause::Age,
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

    let mut exposed = HashSet::default();
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
        announce_ruin(sim, lineage, kind, x, y, cause);
    }
    exposed
}

fn announce_ruin(
    sim: &mut Simulation,
    lineage: String,
    kind: BuildingKind,
    x: i32,
    y: i32,
    cause: DamageCause,
) {
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

fn apply_repairs(sim: &mut Simulation, exposed: &HashSet<usize>) {
    let mut assigned_workers = HashSet::default();
    let mut restored_events = Vec::new();
    let living_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();

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
        // Do not spend whole material units on imperceptible daily wear.
        if building.damage_fraction() < 0.08 && !building.is_ruined() {
            continue;
        }
        let reclaimable = building.is_ruined()
            && building
                .owner_lineage
                .as_ref()
                .is_none_or(|owner| !living_lineages.contains(owner));
        let (x, y, kind) = (building.x, building.y, building.kind);
        let Some(worker_index) = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(index, _)| !assigned_workers.contains(index))
            .filter(|(_, org)| {
                can_repair(org)
                    && (reclaimable || building.owner_lineage.as_deref() == Some(org.lineage_id.as_str()))
            })
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
        let lineage = sim.organisms[worker_index].lineage_id.clone();
        let plan = repair_plan(kind);
        let Some(unit) = plan.next_unit(building.damage_fraction()) else {
            continue;
        };
        if !pooled_resource_available(sim, &lineage, unit) {
            continue;
        }
        // Recruiting reach is not working reach. Repairs should create real
        // journeys just like new construction, rather than happen remotely.
        let (width, height) = building.footprint();
        let worker = &sim.organisms[worker_index];
        let distance = (worker.x - worker.x.clamp(x as f32, x as f32 + f32::from(width) - 1.0)).abs()
            + (worker.y - worker.y.clamp(y as f32, y as f32 + f32::from(height) - 1.0)).abs();
        if distance > 3.0 {
            let target = [
                (x - 1, y),
                (x, y - 1),
                (x + i32::from(width), y),
                (x, y + i32::from(height)),
            ]
            .into_iter()
            .filter(|&(tx, ty)| sim.grid.get(tx, ty).walkable())
            .min_by_key(|&(tx, ty)| ((worker.x - tx as f32).abs() + (worker.y - ty as f32).abs()) as i32);
            if let Some(target) = target {
                assigned_workers.insert(worker_index);
                let worker = &mut sim.organisms[worker_index];
                if worker
                    .journey
                    .as_ref()
                    .is_none_or(|journey| journey.target != target)
                {
                    worker.begin_journey(
                        target,
                        &format!("going to repair a {}", kind.name()),
                        sim.tick_count,
                    );
                }
            }
            continue;
        }
        let repair_amount = 1.0 / plan.total_units() as f32;

        consume_pooled_resource(sim, &lineage, unit);
        assigned_workers.insert(worker_index);
        sim.organisms[worker_index].energy = (sim.organisms[worker_index].energy - 0.008).max(0.0);

        sim.organisms[worker_index].thought = if reclaimable {
            format!("reclaiming an abandoned {}", kind.name())
        } else {
            format!("repairing our {}", kind.name())
        };
        let building = &mut sim.buildings[building_index];
        if reclaimable {
            building.owner_lineage = Some(lineage.clone());
        }
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

/// A disaster landing on the world: every completed building with any part
/// of its footprint within `radius` of (x, y) takes `core` damage at the
/// centre, falling to `edge` at the rim. Returns how many were hit.
pub(crate) fn strike_buildings(
    sim: &mut Simulation,
    x: i32,
    y: i32,
    radius: f32,
    core: f32,
    edge: f32,
    cause: DamageCause,
) -> usize {
    let tick = sim.tick_count;
    let r = radius.max(0.5);
    let mut hit = 0;
    let mut ruined = Vec::new();
    for building in sim.buildings.iter_mut() {
        if !building.is_complete() || building.decorative || !supports_damage(building.kind) {
            continue;
        }
        let (nx, ny) = building.closest_footprint_tile(x, y);
        let d = ((nx - x) as f32).hypot((ny - y) as f32);
        if d > r {
            continue;
        }
        let was_ruined = building.is_ruined();
        let amount = edge + (core - edge) * (1.0 - d / r);
        building.damage = (building.damage_fraction() + amount).min(1.0);
        building.last_damage_tick = Some(tick);
        if !was_ruined && building.damage_fraction() >= 1.0 {
            building.ruined_at_tick = Some(tick);
            let (fw, fh) = building.footprint();
            ruined.push((
                building
                    .owner_lineage
                    .clone()
                    .unwrap_or_else(|| "world".to_string()),
                building.kind,
                (building.x, building.y, i32::from(fw), i32::from(fh)),
                building.occupants.clone(),
            ));
        }
        hit += 1;
    }
    if hit > 0 {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    for (lineage, kind, (bx, by, fw, fh), occupants) in ruined {
        // Whoever was inside is hurt; the household loses its home.
        for o in sim.organisms.iter_mut().filter(|o| o.alive) {
            let (ox, oy) = (o.x as i32, o.y as i32);
            let inside = ox >= bx && ox < bx + fw && oy >= by && oy < by + fh;
            if inside {
                o.health = (o.health - 0.35).max(0.05);
                o.fear_level = (o.fear_level + 0.4).min(1.0);
            }
            if inside || occupants.contains(&o.id) {
                o.hope = (o.hope - 0.15).max(0.0);
                o.think("our home was destroyed", tick);
            }
        }
        announce_ruin(sim, lineage, kind, bx, by, cause);
    }
    hit
}

/// Earthquake god tool: shakes buildings near (x, y), worst at the centre.
pub(crate) fn quake_damage(sim: &mut Simulation, x: i32, y: i32, radius: i32) -> usize {
    strike_buildings(sim, x, y, radius as f32, 0.8, 0.35, DamageCause::Quake)
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
        assert!(
            (sim.buildings[besieged].damage_fraction() - battle_damage(BattleScale::Siege)).abs() < 0.000_01
        );
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
}

#[cfg(test)]
mod disaster_tests {
    use super::*;

    /// A finished house on open grass, with nobody near enough to be the
    /// nearest living thing for lightning.
    fn house_world() -> (Simulation, u32) {
        let mut sim = Simulation::new(3);
        for y in 85..120 {
            for x in 85..120 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.retain(|o| (o.x - 102.0).hypot(o.y - 102.0) > 40.0);
        sim.animals.clear();
        let mut house = Building::new(900, BuildingKind::House, 101, 101, None, 1);
        house.condition = 1.0;
        sim.buildings.push(house);
        (sim, 900)
    }

    fn damage(sim: &Simulation, id: u32) -> f32 {
        sim.buildings
            .iter()
            .find(|b| b.id == id)
            .map_or(1.0, |b| b.damage_fraction())
    }

    #[test]
    fn every_disaster_that_lands_on_a_home_damages_it() {
        for (cmd, at_least) in [
            (r#"{"cmd":"meteor","x":102,"y":102,"radius":4}"#, 0.99),
            (r#"{"cmd":"volcano","x":102,"y":102,"radius":5}"#, 0.99),
            (r#"{"cmd":"earthquake","x":102,"y":102,"radius":6}"#, 0.5),
            (r#"{"cmd":"smite","x":102,"y":102,"radius":2}"#, 0.3),
            (r#"{"cmd":"flood","x":102,"y":102,"radius":6}"#, 0.25),
            (r#"{"cmd":"blizzard","x":102,"y":102,"radius":6}"#, 0.1),
            (
                r#"{"cmd":"paint","x":102,"y":102,"tile":"water","radius":2}"#,
                0.99,
            ),
            (
                r#"{"cmd":"paint","x":102,"y":102,"tile":"rock","radius":2}"#,
                0.99,
            ),
        ] {
            let (mut sim, id) = house_world();
            assert!(sim.apply_command_json(cmd), "{cmd} had no effect");
            assert!(damage(&sim, id) >= at_least, "{cmd}: damage {}", damage(&sim, id));
        }
    }

    #[test]
    fn a_home_standing_in_a_lake_keeps_flooding() {
        let (mut sim, id) = house_world();
        for y in 99..105 {
            for x in 99..105 {
                sim.grid.set(x, y, Tile::Water);
            }
        }
        for _ in 0..10 {
            sim.tick_count += DAMAGE_TICK_INTERVAL;
            tick_building_damage(&mut sim);
        }
        assert!(damage(&sim, id) > 0.02);
    }

    #[test]
    fn a_ruined_home_hurts_who_is_inside_and_is_announced() {
        let (mut sim, id) = house_world();
        let person = sim.organisms.iter_mut().find(|o| o.alive).expect("someone");
        person.x = 101.0;
        person.y = 101.0;
        person.health = 1.0;
        let pid = person.id.clone();
        let hit = strike_buildings(&mut sim, 101, 101, 2.0, 1.0, 1.0, DamageCause::Meteor);
        assert_eq!(hit, 1);
        assert!(damage(&sim, id) >= 1.0);
        let p = sim.organisms.iter().find(|o| o.id == pid).unwrap();
        assert!(p.health < 0.7);
        assert!(sim
            .events
            .iter()
            .any(|e| e.etype == "building_ruined" && e.detail.contains("a falling star")));
    }

    #[test]
    fn distant_disasters_spare_the_home() {
        let (mut sim, id) = house_world();
        sim.apply_command_json(r#"{"cmd":"meteor","x":140,"y":140,"radius":4}"#);
        assert_eq!(damage(&sim, id), 0.0);
    }
}
