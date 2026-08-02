use std::collections::HashSet;

use super::{
    actions::warfare::stand_guard::active_guard, simulation::Simulation, tech::buildings::BuildingKind,
    world_events::push_event,
};
use crate::world::{
    grid::{HEIGHT, WIDTH},
    tiles::Tile,
};

const LOOKOUT_RESPONSE_INTERVAL: u64 = 15;
const LOOKOUT_SCAN_RADIUS: i32 = 24;
const LOOKOUT_WATER_RADIUS: i32 = 12;
const LOOKOUT_SUPPRESSION: f32 = 0.50;

#[derive(Clone)]
struct StaffedLookout {
    x: i32,
    y: i32,
    lineage: String,
    guard: usize,
}

fn nearest_fire(
    sim: &Simulation,
    lookout: &StaffedLookout,
    claimed: &HashSet<(i32, i32)>,
) -> Option<(i32, i32)> {
    let min_x = (lookout.x - LOOKOUT_SCAN_RADIUS).max(1);
    let max_x = (lookout.x + LOOKOUT_SCAN_RADIUS).min(WIDTH as i32 - 2);
    let min_y = (lookout.y - LOOKOUT_SCAN_RADIUS).max(1);
    let max_y = (lookout.y + LOOKOUT_SCAN_RADIUS).min(HEIGHT as i32 - 2);
    let mut best = None;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if claimed.contains(&(x, y))
                || sim.grid.get(x, y) != Tile::Fire
                || sim.grid.fire_intensity(x, y) <= 0.0
            {
                continue;
            }
            let distance = (x - lookout.x).abs() + (y - lookout.y).abs();
            if distance > LOOKOUT_SCAN_RADIUS {
                continue;
            }
            let candidate = (distance, y, x);
            if best.is_none_or(|current: (i32, i32, i32)| candidate < current) {
                best = Some(candidate);
            }
        }
    }
    best.map(|(_, y, x)| (x, y))
}

fn water_cache_for(sim: &Simulation, lookout: &StaffedLookout) -> Option<usize> {
    sim.supply_caches
        .iter()
        .enumerate()
        .filter(|(_, cache)| {
            cache.lineage_id == lookout.lineage
                && cache.operational()
                && cache.water > 0
                && (cache.x - lookout.x).abs() + (cache.y - lookout.y).abs() <= LOOKOUT_WATER_RADIUS
        })
        .min_by_key(|(index, cache)| {
            (
                (cache.x - lookout.x).abs() + (cache.y - lookout.y).abs(),
                cache.created_tick,
                *index,
            )
        })
        .map(|(index, _)| index)
}

fn has_reusable_water(sim: &Simulation, lookout: &StaffedLookout) -> bool {
    let owned_waterworks = sim.buildings.iter().any(|building| {
        building.is_operational()
            && building.owner_lineage.as_deref() == Some(lookout.lineage.as_str())
            && matches!(
                building.kind,
                BuildingKind::Well | BuildingKind::WaterTower | BuildingKind::Reservoir
            )
            && (building.x - lookout.x).abs() + (building.y - lookout.y).abs() <= LOOKOUT_WATER_RADIUS
    });
    owned_waterworks
        || (-LOOKOUT_WATER_RADIUS..=LOOKOUT_WATER_RADIUS).any(|dy| {
            (-LOOKOUT_WATER_RADIUS..=LOOKOUT_WATER_RADIUS).any(|dx| {
                dx.abs() + dy.abs() <= LOOKOUT_WATER_RADIUS
                    && sim.grid.get(lookout.x + dx, lookout.y + dy) == Tile::Water
            })
        })
}

/// Staffed, completed lookout towers turn wildfire visibility into a material
/// response loop. A tower needs a living area guard and either one ration of
/// stored water or nearby owned water infrastructure/natural water. Each crew
/// handles at most one fire front per response interval, so towers improve a
/// settlement's odds without making wildfire harmless or free.
pub(crate) fn tick_wildfire_response(sim: &mut Simulation) {
    if !sim.tick_count.is_multiple_of(LOOKOUT_RESPONSE_INTERVAL) {
        return;
    }

    let lookouts: Vec<StaffedLookout> = sim
        .buildings
        .iter()
        .filter(|building| building.kind == BuildingKind::Watchtower && building.is_operational())
        .filter_map(|building| {
            let lineage = building.owner_lineage.clone()?;
            let (x, y) = building.closest_footprint_tile(building.x, building.y);
            let guard = active_guard(sim, &lineage, x, y)?;
            Some(StaffedLookout { x, y, lineage, guard })
        })
        .collect();
    if lookouts.is_empty() {
        return;
    }

    let mut claimed = HashSet::with_capacity(lookouts.len());
    for lookout in lookouts {
        let Some((fire_x, fire_y)) = nearest_fire(sim, &lookout, &claimed) else {
            continue;
        };
        let cache_index = water_cache_for(sim, &lookout);
        if cache_index.is_none() && !has_reusable_water(sim, &lookout) {
            continue;
        }
        claimed.insert((fire_x, fire_y));

        if let Some(cache_index) = cache_index {
            let cache = &mut sim.supply_caches[cache_index];
            cache.water -= 1;
            cache.last_used_tick = sim.tick_count;
            sim.supply_cache_state_revision = sim.supply_cache_state_revision.wrapping_add(1);
        }

        let prior = sim.grid.fire_intensity(fire_x, fire_y);
        let remaining = (prior - LOOKOUT_SUPPRESSION).max(0.0);
        if remaining <= 0.01 {
            sim.grid.set(fire_x, fire_y, Tile::Ash);
            *sim.grid.fire_intensity_mut(fire_x, fire_y) = 0.0;
        } else {
            *sim.grid.fire_intensity_mut(fire_x, fire_y) = remaining;
        }
        let guard = &mut sim.organisms[lookout.guard];
        guard.energy = (guard.energy - 0.025).max(0.0);
        guard.fear_level = (guard.fear_level + 0.015).min(1.0);
        guard.think("directing a bucket crew from the lookout", sim.tick_count);

        let detail = if remaining <= 0.01 {
            format!("a staffed lookout contained the wildfire at ({fire_x},{fire_y})")
        } else {
            format!("a staffed lookout spotted and fought the wildfire at ({fire_x},{fire_y})")
        };
        push_event(
            &mut sim.events,
            sim.tick_count,
            "weather",
            &lookout.lineage,
            &detail,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{survival_resources::SupplyCache, tech::buildings::Building};

    fn staffed_lookout(seed: u64) -> (Simulation, usize, i32, i32) {
        let mut sim = Simulation::new(seed);
        sim.buildings.clear();
        sim.organisms.truncate(1);
        let guard = 0;
        let lineage = sim.organisms[guard].lineage_id.clone();
        let (x, y) = (100, 100);
        for tile_y in y - LOOKOUT_SCAN_RADIUS - 1..=y + LOOKOUT_SCAN_RADIUS + 1 {
            for tile_x in x - LOOKOUT_SCAN_RADIUS - 1..=x + LOOKOUT_SCAN_RADIUS + 1 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }
        sim.organisms[guard].alive = true;
        sim.organisms[guard].age = sim.organisms[guard].max_age / 2;
        sim.organisms[guard].health = 1.0;
        sim.organisms[guard].energy = 1.0;
        sim.organisms[guard].x = x as f32;
        sim.organisms[guard].y = y as f32;
        sim.organisms[guard].directive = format!("guard_area:{x}:{y}");
        sim.organisms[guard].directive_until = 1_000;
        let mut tower = Building::new(1, BuildingKind::Watchtower, x, y, Some(lineage), 0);
        tower.condition = 1.0;
        sim.buildings.push(tower);
        sim.tick_count = LOOKOUT_RESPONSE_INTERVAL;
        (sim, guard, x, y)
    }

    #[test]
    fn staffed_lookout_spends_real_cached_water_and_extinguishes_over_time() {
        let (mut sim, guard, x, y) = staffed_lookout(0xF1A_E001);
        let lineage = sim.organisms[guard].lineage_id.clone();
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: lineage,
            water: 2,
            ..SupplyCache::default()
        });
        sim.grid.set(x + 10, y, Tile::Fire);
        *sim.grid.fire_intensity_mut(x + 10, y) = 1.0;

        tick_wildfire_response(&mut sim);
        assert_eq!(sim.supply_caches[0].water, 1);
        assert!((sim.grid.fire_intensity(x + 10, y) - 0.5).abs() < f32::EPSILON);
        assert!(sim.organisms[guard].energy < 1.0);

        sim.tick_count += LOOKOUT_RESPONSE_INTERVAL;
        tick_wildfire_response(&mut sim);
        assert_eq!(sim.supply_caches[0].water, 0);
        assert_eq!(sim.grid.get(x + 10, y), Tile::Ash);
        assert_eq!(sim.grid.fire_intensity(x + 10, y), 0.0);
    }

    #[test]
    fn unstaffed_unfinished_or_dry_lookouts_cannot_suppress_fire() {
        let (mut sim, guard, x, y) = staffed_lookout(0xF1A_E002);
        sim.grid.set(x + 8, y, Tile::Fire);
        *sim.grid.fire_intensity_mut(x + 8, y) = 1.0;

        tick_wildfire_response(&mut sim);
        assert_eq!(sim.grid.fire_intensity(x + 8, y), 1.0);

        sim.grid.set(x, y + 1, Tile::Water);
        sim.organisms[guard].directive.clear();
        tick_wildfire_response(&mut sim);
        assert_eq!(sim.grid.fire_intensity(x + 8, y), 1.0);

        sim.organisms[guard].directive = format!("guard_area:{x}:{y}");
        sim.buildings[0].condition = 0.5;
        tick_wildfire_response(&mut sim);
        assert_eq!(sim.grid.fire_intensity(x + 8, y), 1.0);
    }

    #[test]
    fn owned_operational_well_supports_response_without_conjuring_cache_water() {
        let (mut sim, guard, x, y) = staffed_lookout(0xF1A_E003);
        let lineage = sim.organisms[guard].lineage_id.clone();
        let mut well = Building::new(2, BuildingKind::Well, x + 2, y, Some(lineage), 0);
        well.condition = 1.0;
        sim.buildings.push(well);
        sim.grid.set(x + 6, y, Tile::Fire);
        *sim.grid.fire_intensity_mut(x + 6, y) = 1.0;

        tick_wildfire_response(&mut sim);

        assert!(sim.supply_caches.is_empty());
        assert!((sim.grid.fire_intensity(x + 6, y) - 0.5).abs() < f32::EPSILON);
    }
}
