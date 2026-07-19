use crate::sim::agriculture::{CropKind, Farm};
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::world::tiles::Tile;

const MIN_FARM_FERTILITY: f32 = 0.20;
const FOOD_CROP_ROTATION: [CropKind; 6] = [
    CropKind::Wheat,
    CropKind::Barley,
    CropKind::Rice,
    CropKind::Maize,
    CropKind::Beans,
    CropKind::Potato,
];

#[derive(Clone, Copy)]
pub(crate) enum FarmCare {
    Tend,
    Weed,
    Water { irrigated: bool },
    Rotate { practiced: bool },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct HarvestResult {
    pub yield_units: u8,
    pub soil_depletion: f32,
}

pub(crate) fn has_farm_at(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.farms.iter().any(|farm| farm.x == x && farm.y == y)
}

fn farm_index_at(sim: &Simulation, x: i32, y: i32) -> Option<usize> {
    sim.farms.iter().position(|farm| farm.x == x && farm.y == y)
}

/// Choose a food crop the lineage can actually cultivate. New fields vary by
/// location, while a harvested field advances through the unlocked rotation
/// instead of silently becoming wheat forever.
pub(crate) fn crop_for_plot(sim: &Simulation, idx: usize, x: i32, y: i32, water_near: bool) -> CropKind {
    let era = sim
        .organisms
        .get(idx)
        .map(|org| sim.era(&org.lineage_id))
        .unwrap_or(Era::PreStone);
    let unlocked = FOOD_CROP_ROTATION
        .iter()
        .copied()
        .filter(|crop| era >= crop.era_introduced())
        .collect::<Vec<_>>();
    if unlocked.is_empty() {
        return CropKind::Wheat;
    }

    if let Some(previous) = farm_index_at(sim, x, y)
        .and_then(|farm_idx| sim.farms.get(farm_idx))
        .filter(|farm| farm.harvested)
        .map(|farm| farm.crop)
    {
        let previous_idx = unlocked.iter().position(|crop| *crop == previous).unwrap_or(0);
        return unlocked[(previous_idx + 1) % unlocked.len()];
    }

    let hash = (x as i64)
        .wrapping_mul(73_856_093)
        .wrapping_add((y as i64).wrapping_mul(19_349_663))
        .unsigned_abs() as usize;
    if water_near && unlocked.contains(&CropKind::Rice) && hash.is_multiple_of(3) {
        CropKind::Rice
    } else {
        unlocked[hash % unlocked.len()]
    }
}

fn can_claim_plot(sim: &Simulation, owner: &str, lineage_id: &str) -> bool {
    owner == lineage_id
        || !sim
            .organisms
            .iter()
            .any(|org| org.alive && org.lineage_id == owner)
}

fn consume_seed(sim: &mut Simulation, idx: usize) -> bool {
    let org = &mut sim.organisms[idx];
    let saved_seeds = org.tools.get("seeds").copied().unwrap_or(0);
    if saved_seeds > 0 {
        if saved_seeds == 1 {
            org.tools.remove("seeds");
        } else {
            org.tools.insert("seeds".to_string(), saved_seeds - 1);
        }
        return true;
    }
    if org.inv_food == 0 {
        return false;
    }
    org.inv_food -= 1;
    true
}

fn has_seed(sim: &Simulation, idx: usize) -> bool {
    sim.organisms
        .get(idx)
        .is_some_and(|org| org.inv_food > 0 || org.tools.get("seeds").copied().unwrap_or(0) > 0)
}

pub(crate) fn can_prepare_plot(sim: &Simulation, idx: usize, x: i32, y: i32) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    if !matches!(sim.grid.get(x, y), Tile::Grass)
        || sim.era(&org.lineage_id) < Era::Bronze
        || sim.grid.fertility_at(x, y) < MIN_FARM_FERTILITY
    {
        return false;
    }
    farm_index_at(sim, x, y).is_none_or(|farm_idx| {
        let farm = &sim.farms[farm_idx];
        farm.harvested && !farm.prepared && can_claim_plot(sim, &farm.owner_lineage, &org.lineage_id)
    })
}

pub(crate) fn can_plant_crop(
    sim: &Simulation,
    idx: usize,
    x: i32,
    y: i32,
    crop: CropKind,
    require_prepared: bool,
) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    if !matches!(sim.grid.get(x, y), Tile::Grass)
        || sim.era(&org.lineage_id) < crop.era_introduced()
        || sim.grid.fertility_at(x, y) < MIN_FARM_FERTILITY
        || !has_seed(sim, idx)
    {
        return false;
    }
    match farm_index_at(sim, x, y) {
        Some(farm_idx) => {
            let farm = &sim.farms[farm_idx];
            farm.harvested
                && (!require_prepared || farm.prepared)
                && can_claim_plot(sim, &farm.owner_lineage, &org.lineage_id)
        }
        None => !require_prepared,
    }
}

pub(crate) fn can_tend_crop(sim: &Simulation, idx: usize, x: i32, y: i32, care: FarmCare) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    let Some(farm_idx) = farm_index_at(sim, x, y) else {
        return false;
    };
    let farm = &sim.farms[farm_idx];
    if farm.owner_lineage != org.lineage_id {
        return false;
    }
    if matches!(care, FarmCare::Rotate { .. }) {
        return farm.harvested && !farm.prepared;
    }
    !farm.harvested && !farm.is_mature(sim.tick_count)
}

pub(crate) fn can_harvest_crop(sim: &Simulation, idx: usize, x: i32, y: i32) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    farm_index_at(sim, x, y).is_some_and(|farm_idx| {
        let farm = &sim.farms[farm_idx];
        farm.owner_lineage == org.lineage_id && farm.is_mature(sim.tick_count)
    })
}

/// Create or prepare one persistent plot. Active crops and living owners are
/// never overwritten; a dead lineage's abandoned fallow plot can be reclaimed.
pub(crate) fn prepare_plot(sim: &mut Simulation, idx: usize, x: i32, y: i32) -> Option<u32> {
    if !can_prepare_plot(sim, idx, x, y) {
        return None;
    }
    let lineage_id = sim.organisms[idx].lineage_id.clone();
    let tick = sim.tick_count;

    if let Some(farm_idx) = farm_index_at(sim, x, y) {
        let (harvested, prepared, owner) = {
            let farm = &sim.farms[farm_idx];
            (farm.harvested, farm.prepared, farm.owner_lineage.clone())
        };
        if !harvested || prepared || !can_claim_plot(sim, &owner, &lineage_id) {
            return None;
        }
        let farm = &mut sim.farms[farm_idx];
        farm.owner_lineage = lineage_id;
        farm.prepared = true;
        farm.planted_tick = tick;
        farm.ready_tick = tick;
        sim.grid.restore_fertility(x, y, 0.01);
        return Some(farm.id);
    }

    let id = sim.next_farm_id.max(1);
    sim.next_farm_id = id.saturating_add(1);
    sim.farms.push(Farm {
        id,
        x,
        y,
        owner_lineage: lineage_id,
        crop: CropKind::Wheat,
        planted_tick: tick,
        ready_tick: tick,
        harvested: true,
        prepared: true,
    });
    Some(id)
}

/// Plant a crop into a persistent plot. `require_prepared` is used by the
/// explicit sow action; the older all-in-one plant action prepares its own
/// ground but still pays the same seed and ownership costs.
pub(crate) fn plant_crop(
    sim: &mut Simulation,
    idx: usize,
    x: i32,
    y: i32,
    crop: CropKind,
    require_prepared: bool,
) -> Option<u32> {
    if !can_plant_crop(sim, idx, x, y, crop, require_prepared) {
        return None;
    }
    let lineage_id = sim.organisms[idx].lineage_id.clone();

    let existing_idx = farm_index_at(sim, x, y);
    if let Some(farm_idx) = existing_idx {
        let farm = &sim.farms[farm_idx];
        if !farm.harvested
            || (require_prepared && !farm.prepared)
            || !can_claim_plot(sim, &farm.owner_lineage, &lineage_id)
        {
            return None;
        }
    } else if require_prepared {
        return None;
    }

    if !consume_seed(sim, idx) {
        return None;
    }

    let tick = sim.tick_count;
    let ready_tick = tick.saturating_add(crop.growth_ticks() as u64);
    if let Some(farm_idx) = existing_idx {
        let farm = &mut sim.farms[farm_idx];
        farm.owner_lineage = lineage_id;
        farm.crop = crop;
        farm.planted_tick = tick;
        farm.ready_tick = ready_tick;
        farm.harvested = false;
        farm.prepared = false;
        Some(farm.id)
    } else {
        let id = sim.next_farm_id.max(1);
        sim.next_farm_id = id.saturating_add(1);
        sim.farms.push(Farm {
            id,
            x,
            y,
            owner_lineage: lineage_id,
            crop,
            planted_tick: tick,
            ready_tick,
            harvested: false,
            prepared: false,
        });
        Some(id)
    }
}

pub(crate) fn tend_crop(sim: &mut Simulation, idx: usize, x: i32, y: i32, care: FarmCare) -> bool {
    if !can_tend_crop(sim, idx, x, y, care) {
        return false;
    }
    let farm_idx = farm_index_at(sim, x, y).expect("validated farm plot");
    let harvested = sim.farms[farm_idx].harvested;

    let base_growth = sim.farms[farm_idx].crop.growth_ticks() as i64;
    let (deadline_delta, fertility_gain) = match care {
        FarmCare::Tend => (-(base_growth / 80).max(8), 0.01),
        FarmCare::Weed => (-(base_growth / 60).max(10), 0.015),
        FarmCare::Water { irrigated: true } => (-(base_growth / 25).max(18), 0.04),
        FarmCare::Water { irrigated: false } => (-(base_growth / 40).max(12), 0.02),
        FarmCare::Rotate { practiced: true } => (-(base_growth / 50).max(12), 0.08),
        FarmCare::Rotate { practiced: false } => (-(base_growth / 70).max(8), 0.04),
    };

    let before_fertility = sim.grid.fertility_at(x, y);
    let moved = if harvested {
        if matches!(care, FarmCare::Rotate { .. }) {
            sim.farms[farm_idx].prepared = true;
        }
        0
    } else {
        sim.farms[farm_idx].adjust_ready_tick(sim.tick_count, deadline_delta)
    };
    sim.grid.restore_fertility(x, y, fertility_gain);
    moved != 0 || sim.grid.fertility_at(x, y) > before_fertility
}

/// Harvest exactly once, and only after the persisted deadline. Yield and soil
/// cost are both calculated before mutating the farm so save/reload cannot
/// reset or duplicate the result.
pub(crate) fn harvest_crop(sim: &mut Simulation, idx: usize, x: i32, y: i32) -> Option<HarvestResult> {
    if !can_harvest_crop(sim, idx, x, y) {
        return None;
    }
    let lineage_id = sim.organisms[idx].lineage_id.clone();
    let farm_idx = farm_index_at(sim, x, y).expect("validated farm plot");
    let farm = &sim.farms[farm_idx];

    let era = sim.era(&lineage_id);
    let fertility = sim.grid.fertility_at(x, y);
    let result = HarvestResult {
        yield_units: farm.projected_yield(era, fertility),
        soil_depletion: farm.soil_depletion(era, fertility),
    };
    let farm = &mut sim.farms[farm_idx];
    farm.harvested = true;
    farm.prepared = false;
    sim.organisms[idx].inv_food = sim.organisms[idx].inv_food.saturating_add(result.yield_units);
    sim.grid.reduce_fertility(x, y, result.soil_depletion);
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::grid::WorldGrid;

    fn farm_sim() -> (Simulation, usize, i32, i32) {
        let mut sim = Simulation::new(1_337);
        let idx = sim.organisms.iter().position(|org| org.alive).unwrap();
        let (x, y) = (120, 120);
        sim.organisms[idx].x = x as f32;
        sim.organisms[idx].y = y as f32;
        sim.organisms[idx].inv_food = 2;
        let lineage_id = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage_id, Era::Bronze);
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.fertility[WorldGrid::idx(x, y)] = 0.8;
        (sim, idx, x, y)
    }

    #[test]
    fn plow_sow_and_harvest_reuse_one_plot_and_one_deadline() {
        let (mut sim, idx, x, y) = farm_sim();
        let plot_id = prepare_plot(&mut sim, idx, x, y).expect("plow creates plot");
        assert_eq!(sim.farms.len(), 1);
        assert_eq!(sim.organisms[idx].inv_food, 2);

        assert_eq!(
            plant_crop(&mut sim, idx, x, y, CropKind::Wheat, true),
            Some(plot_id)
        );
        assert_eq!(sim.organisms[idx].inv_food, 1, "one seed is consumed");
        assert_eq!(sim.farms.len(), 1);
        assert!(plant_crop(&mut sim, idx, x, y, CropKind::Wheat, false).is_none());
        assert_eq!(sim.farms.len(), 1, "active plot cannot be duplicated");

        let ready_tick = sim.farms[0].ready_tick;
        sim.tick_count = ready_tick - 1;
        assert!(harvest_crop(&mut sim, idx, x, y).is_none());
        assert_eq!(sim.organisms[idx].inv_food, 1);

        sim.tick_count = ready_tick;
        let result = harvest_crop(&mut sim, idx, x, y).expect("mature crop harvests");
        assert!(result.yield_units > 1);
        let food_after = sim.organisms[idx].inv_food;
        assert!(harvest_crop(&mut sim, idx, x, y).is_none());
        assert_eq!(sim.organisms[idx].inv_food, food_after, "harvest is single-use");

        assert!(prepare_plot(&mut sim, idx, x, y).is_some());
        assert_eq!(sim.farms.len(), 1);
        sim.organisms[idx].tools.insert("seeds".to_string(), 1);
        assert_eq!(
            plant_crop(&mut sim, idx, x, y, CropKind::Wheat, true),
            Some(plot_id)
        );
        assert_eq!(sim.farms.len(), 1);
        assert!(!sim.organisms[idx].tools.contains_key("seeds"));
    }

    #[test]
    fn tending_moves_deadline_but_never_beyond_crop_bound() {
        let (mut sim, idx, x, y) = farm_sim();
        plant_crop(&mut sim, idx, x, y, CropKind::Wheat, false).unwrap();
        let planted = sim.farms[0].planted_tick;
        for _ in 0..200 {
            tend_crop(&mut sim, idx, x, y, FarmCare::Water { irrigated: true });
        }
        assert_eq!(sim.farms[0].ready_tick, planted + 1200 * 3 / 5);
    }

    #[test]
    fn crop_choice_unlocks_variety_and_rotation_prepares_the_next_cycle() {
        let (mut sim, idx, x, y) = farm_sim();
        let first = crop_for_plot(&sim, idx, x, y, false);
        assert!(matches!(
            first,
            CropKind::Wheat | CropKind::Barley | CropKind::Rice
        ));
        plant_crop(&mut sim, idx, x, y, first, false).unwrap();
        sim.tick_count = sim.farms[0].ready_tick;
        harvest_crop(&mut sim, idx, x, y).unwrap();

        assert!(tend_crop(
            &mut sim,
            idx,
            x,
            y,
            FarmCare::Rotate { practiced: true }
        ));
        assert!(sim.farms[0].prepared);
        let next = crop_for_plot(&sim, idx, x, y, false);
        assert_ne!(next, first);
        assert!(sim.era(&sim.organisms[idx].lineage_id) >= next.era_introduced());
    }
}
