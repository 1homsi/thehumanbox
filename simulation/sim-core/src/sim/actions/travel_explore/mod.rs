pub mod blaze_trail;
pub mod build_temporary_shelter;
pub mod camp_overnight;
pub mod camp_two_nights;
pub mod chart_constellations;
pub mod cross_desert;
pub mod cross_jungle;
pub mod cross_mountain;
pub mod cross_steppe;
pub mod cross_swamp;
pub mod cross_tundra;
pub mod drop_marker;
pub mod follow_animal_trail;
pub mod ford_river;
pub mod identify_landmark;
pub mod join_pilgrimage;
pub mod join_traders;
pub mod leave_cairn;
pub mod leave_marker;
pub mod leave_token;
pub mod lie_in_grass;
pub mod map_canyon;
pub mod map_cavern;
pub mod map_island;
pub mod map_shoreline;
pub mod name_bay;
pub mod name_creek;
pub mod name_hill;
pub mod paint_overlook;
pub mod photograph_overlook;
pub mod portage_canoe;
pub mod return_home;
pub mod scout_cave;
pub mod scout_coast;
pub mod scout_island;
pub mod scout_ridge;
pub mod scout_river_bend;
pub mod scout_ruins;
pub mod scout_valley;
pub mod seek_pilgrimage;
pub mod stargaze_alone;
pub mod sunbathe;
pub mod tag_along_caravan;
pub mod trek_with_pack;
pub mod visit_ancestor_grave;
pub mod visit_holy_site;
pub mod visit_hot_spring;
pub mod visit_oasis;
pub mod walk_to_neighbor_camp;
pub mod walk_to_next_village;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    if matches!(action, 1440..=1455 | 1459..=1473 | 1489) {
        return start_travel(action, ctx);
    }
    match action {
        1440 => walk_to_next_village::apply(ctx),
        1441 => walk_to_neighbor_camp::apply(ctx),
        1442 => seek_pilgrimage::apply(ctx),
        1443 => visit_ancestor_grave::apply(ctx),
        1444 => visit_holy_site::apply(ctx),
        1445 => visit_hot_spring::apply(ctx),
        1446 => visit_oasis::apply(ctx),
        1447 => cross_desert::apply(ctx),
        1448 => cross_steppe::apply(ctx),
        1449 => cross_tundra::apply(ctx),
        1450 => cross_mountain::apply(ctx),
        1451 => cross_jungle::apply(ctx),
        1452 => cross_swamp::apply(ctx),
        1453 => ford_river::apply(ctx),
        1454 => portage_canoe::apply(ctx),
        1455 => trek_with_pack::apply(ctx),
        1456 => camp_overnight::apply(ctx),
        1457 => camp_two_nights::apply(ctx),
        1458 => build_temporary_shelter::apply(ctx),
        1459 => scout_ridge::apply(ctx),
        1460 => scout_valley::apply(ctx),
        1461 => scout_river_bend::apply(ctx),
        1462 => scout_coast::apply(ctx),
        1463 => scout_island::apply(ctx),
        1464 => scout_ruins::apply(ctx),
        1465 => scout_cave::apply(ctx),
        1466 => follow_animal_trail::apply(ctx),
        1467 => tag_along_caravan::apply(ctx),
        1468 => join_pilgrimage::apply(ctx),
        1469 => join_traders::apply(ctx),
        1470 => map_canyon::apply(ctx),
        1471 => map_island::apply(ctx),
        1472 => map_shoreline::apply(ctx),
        1473 => map_cavern::apply(ctx),
        1474 => photograph_overlook::apply(ctx),
        1475 => paint_overlook::apply(ctx),
        1476 => chart_constellations::apply(ctx),
        1477 => stargaze_alone::apply(ctx),
        1478 => sunbathe::apply(ctx),
        1479 => lie_in_grass::apply(ctx),
        1480 => identify_landmark::apply(ctx),
        1481 => name_creek::apply(ctx),
        1482 => name_hill::apply(ctx),
        1483 => name_bay::apply(ctx),
        1484 => drop_marker::apply(ctx),
        1485 => blaze_trail::apply(ctx),
        1486 => leave_cairn::apply(ctx),
        1487 => leave_marker::apply(ctx),
        1488 => leave_token::apply(ctx),
        1489 => return_home::apply(ctx),
        _ => 0.0,
    }
}

// Travel must change where a person is going. The old generated handlers
// awarded comfort for staying on the same tile and merely saying "scout".
fn start_travel(action: usize, ctx: &mut ActionCtx) -> f32 {
    use crate::world::{
        grid::{WorldGrid, HEIGHT, WIDTH},
        tiles::{Biome, Tile},
    };
    use rand::RngExt;

    if ctx.org().journey.is_some() {
        return 0.0;
    }
    let origin = (ctx.ix, ctx.iy);
    let home = (ctx.org().home_x as i32, ctx.org().home_y as i32);
    let description = match action {
        1440 | 1441 | 1467 | 1469 => "visiting another settlement",
        1442 | 1444 | 1468 => "travelling on pilgrimage",
        1443 => "returning to ancestral land",
        1445 | 1446 | 1453 | 1454 | 1461 | 1462 | 1472 => "exploring the shoreline",
        1447 => "exploring the desert",
        1448 => "crossing the grasslands",
        1449 => "exploring the tundra",
        1450 | 1459 | 1465 | 1470 | 1473 => "scouting the hills",
        1451 => "exploring the forest",
        1452 => "exploring the wetlands",
        1464 => "scouting old ruins",
        1489 => "returning home",
        _ => "scouting new land",
    };
    let destination = if matches!(action, 1443 | 1489) {
        ctx.sim.nearest_land_from(home.0, home.1, 4)
    } else if matches!(action, 1442 | 1444 | 1468) {
        use crate::sim::tech::buildings::BuildingKind;
        let destination = ctx
            .sim
            .buildings
            .iter()
            .filter(|b| {
                b.ruined_at_tick.is_none()
                    && b.condition >= 1.0
                    && matches!(
                        b.kind,
                        BuildingKind::Temple | BuildingKind::Cathedral | BuildingKind::Shrine
                    )
            })
            .filter(|b| (b.x - origin.0).abs() + (b.y - origin.1).abs() >= 12)
            .min_by_key(|b| (b.x - origin.0).abs() + (b.y - origin.1).abs())
            .map(|b| (b.x, b.y));
        destination.and_then(|(x, y)| ctx.sim.nearest_land_from(x, y, 5))
    } else if matches!(action, 1440 | 1441 | 1467 | 1469) {
        let destination = ctx
            .sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id != ctx.lid)
            .map(|o| (o.home_x as i32, o.home_y as i32))
            .filter(|&(x, y)| (x - origin.0).abs() + (y - origin.1).abs() >= 12)
            .min_by_key(|&(x, y)| (x - origin.0).abs() + (y - origin.1).abs());
        destination.and_then(|(x, y)| ctx.sim.nearest_land_from(x, y, 5))
    } else {
        let mut selected = None;
        let mut best = f32::NEG_INFINITY;
        // Fixed work budget, independent of world size or population.
        for _ in 0..96 {
            let x = (origin.0 + ctx.sim.rng.random_range(-64..=64)).clamp(5, WIDTH as i32 - 5);
            let y = (origin.1 + ctx.sim.rng.random_range(-64..=64)).clamp(5, HEIGHT as i32 - 5);
            let distance = (x - origin.0).abs().max((y - origin.1).abs());
            if distance < 12 || !ctx.sim.is_good_land_target(x, y) {
                continue;
            }
            let grid = &ctx.sim.grid;
            let biome = grid.biome_at(x, y);
            let matches = match action {
                1447 => biome == Biome::Desert,
                1448 => biome == Biome::Grassland,
                1449 => biome == Biome::Tundra,
                1451 => biome == Biome::Forest,
                1452 => biome == Biome::Wetland,
                1445 | 1446 | 1453 | 1454 | 1461 | 1462 | 1472 => {
                    (-2..=2).any(|dx| (-2..=2).any(|dy| grid.get(x + dx, y + dy) == Tile::Water))
                }
                1450 | 1459 | 1465 | 1470 | 1473 => grid.elevation[WorldGrid::idx(x, y)] > 0.6,
                1464 => ctx
                    .sim
                    .buildings
                    .iter()
                    .any(|b| b.ruined_at_tick.is_some() && (b.x - x).abs() + (b.y - y).abs() < 8),
                _ => true,
            };
            if !matches {
                continue;
            }
            let novelty = 1.0 - grid.pressure[WorldGrid::idx(x, y)].clamp(0.0, 1.0);
            let score = novelty - (distance as f32 - 32.0).abs() * 0.01;
            if score > best {
                best = score;
                selected = Some((x, y));
            }
        }
        selected
    };
    let Some(target) = destination else {
        ctx.think("looking for a route");
        return -0.005;
    };
    if (target.0 - origin.0).abs().max((target.1 - origin.1).abs()) <= 2 {
        return 0.0;
    }
    let tick = ctx.tick;
    ctx.org_mut().begin_journey(target, description, tick);
    // Only a small planning reward. Arrival and actual movement matter more.
    0.001
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{simulation::Simulation, spatial::SpatialIndex};
    use crate::world::{grid::WorldGrid, tiles::Tile};

    #[test]
    fn scouting_starts_a_real_journey_that_survives_save_and_completes() {
        let mut sim = Simulation::new(42);
        sim.organisms.truncate(1);
        sim.organisms[0].x = 100.0;
        sim.organisms[0].y = 100.0;
        for x in 30..170 {
            for y in 30..170 {
                sim.grid.set(x, y, Tile::Sand);
                sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
            }
        }
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, 0, 100, 100, &spatial);
        assert!(apply(1460, &mut ctx) > 0.0);
        let target = sim.organisms[0].journey.as_ref().unwrap().target;
        assert!((target.0 - 100).abs().max((target.1 - 100).abs()) >= 12);
        let saved = sim.to_save_state();
        let mut restored = Simulation::from_save(42, saved);
        assert_eq!(restored.organisms[0].journey.as_ref().unwrap().target, target);
        restored.organisms[0].x = target.0 as f32;
        restored.organisms[0].y = target.1 as f32;
        restored.validate_or_assign_wander_target(0);
        assert!(restored.organisms[0].journey.is_none());
        assert!(restored.organisms[0].wander_target.is_none());
    }

    #[test]
    fn expired_journey_is_released() {
        let mut sim = Simulation::new(42);
        sim.organisms[0].begin_journey((100, 100), "exploring", 0);
        sim.tick_count = 1000;
        sim.validate_or_assign_wander_target(0);
        assert!(sim.organisms[0].journey.is_none());
    }
}
