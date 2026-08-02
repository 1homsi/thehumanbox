use super::super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;
use crate::sim::survival_resources::CacheSabotageOutcome;

fn farm_target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<usize> {
    let actor = sim.organisms.get(idx).filter(|actor| actor.alive)?;
    let mut candidates: Vec<usize> = sim
        .farms
        .iter()
        .enumerate()
        .filter(|(_, farm)| {
            !farm.harvested
                && farm.owner_lineage != actor.lineage_id
                && actor.attitude_toward(&farm.owner_lineage) < -0.20
                && (farm.x - x).abs() + (farm.y - y).abs() <= 3
        })
        .map(|(index, _)| index)
        .collect();
    candidates.sort_unstable_by_key(|&index| {
        let farm = &sim.farms[index];
        ((farm.x - x).abs() + (farm.y - y).abs(), farm.id)
    });
    candidates.first().copied()
}

pub fn can_apply(sim: &Simulation, idx: usize, x: i32, y: i32) -> bool {
    sim.can_sabotage_supply_cache(idx, x, y) || farm_target(sim, idx, x, y).is_some()
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    match ctx.sim.sabotage_supply_cache(ctx.idx, ctx.ix, ctx.iy) {
        Some(CacheSabotageOutcome::Damaged) => {
            ctx.org_mut().energy = (ctx.org().energy - 0.025).max(0.0);
            ctx.think("spoiling a rival cache");
            ctx.event("war", "spoiled supplies in a rival cache");
            return 0.012;
        }
        Some(CacheSabotageOutcome::Intercepted) => {
            ctx.think("caught trying to sabotage a guarded cache");
            ctx.event("war", "a guard prevented cache sabotage");
            return -0.010;
        }
        None => {}
    }
    let Some(index) = farm_target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    let (farm_x, farm_y, owner) = {
        let farm = &ctx.sim.farms[index];
        (farm.x, farm.y, farm.owner_lineage.clone())
    };
    if super::stand_guard::active_guard(ctx.sim, &owner, farm_x, farm_y).is_some() {
        ctx.org_mut().energy = (ctx.org().energy - 0.02).max(0.0);
        ctx.org_mut().fear_level = (ctx.org().fear_level + 0.04).min(1.0);
        ctx.think("driven out of a guarded field");
        ctx.event("war", "a guard prevented crop sabotage");
        return -0.010;
    }
    let (crop, destroyed) = {
        let farm = &mut ctx.sim.farms[index];
        let crop = farm.crop.name();
        if farm.is_mature(ctx.tick) {
            farm.harvested = true;
            farm.prepared = false;
            (crop, true)
        } else {
            let delay = farm
                .ready_tick
                .saturating_sub(farm.planted_tick)
                .div_ceil(8)
                .max(120);
            farm.adjust_ready_tick(ctx.tick, delay as i64);
            (crop, false)
        }
    };
    super::intercept_raid::mark_recent_attack(ctx.sim, ctx.idx, &owner, farm_x, farm_y, None);
    ctx.org_mut().energy = (ctx.org().energy - 0.03).max(0.0);
    ctx.think(if destroyed {
        "destroying a rival harvest"
    } else {
        "damaging rival crops"
    });
    ctx.event(
        "war",
        &format!(
            "{} a rival {} crop",
            if destroyed { "destroyed" } else { "delayed" },
            crop
        ),
    );
    0.014
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::try_apply;
    use crate::sim::agriculture::{CropKind, Farm};
    use crate::sim::spatial::SpatialIndex;
    use crate::world::tiles::Tile;

    fn hostile_farm_world(mature: bool) -> (Simulation, usize, i32, i32) {
        let mut sim = Simulation::new(0x5AB07A6E);
        sim.farms.clear();
        let actor = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.tick_count = 500;
        sim.farms.push(Farm {
            id: 77,
            x: x + 1,
            y,
            owner_lineage: "rivals".into(),
            crop: CropKind::Wheat,
            planted_tick: 100,
            ready_tick: if mature { 400 } else { 1_300 },
            harvested: false,
            prepared: false,
        });
        (sim, actor, x, y)
    }

    #[test]
    fn sabotage_delays_real_hostile_crop_but_does_not_destroy_wild_food() {
        let (mut sim, actor, x, y) = hostile_farm_world(false);
        sim.grid.set(x, y, Tile::Food);
        let ready_before = sim.farms[0].ready_tick;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, actor, 99, x, y, &spatial).is_some());
        assert!(sim.farms[0].ready_tick > ready_before);
        assert_eq!(sim.grid.get(x, y), Tile::Food);
    }

    #[test]
    fn sabotage_destroys_a_mature_hostile_harvest_without_creating_inventory() {
        let (mut sim, actor, x, y) = hostile_farm_world(true);
        let food_before = sim.organisms[actor].inv_food;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, actor, 99, x, y, &spatial).is_some());
        assert!(sim.farms[0].harvested);
        assert!(!sim.farms[0].prepared);
        assert_eq!(sim.organisms[actor].inv_food, food_before);
        assert!(try_apply(&mut sim, actor, 99, x, y, &spatial).is_none());
    }

    #[test]
    fn neutral_farm_and_wild_food_do_not_enable_sabotage() {
        let (mut sim, actor, x, y) = hostile_farm_world(false);
        sim.organisms[actor].lineage_attitudes.clear();
        sim.grid.set(x, y, Tile::Food);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!can_apply(&sim, actor, x, y));
        assert!(try_apply(&mut sim, actor, 99, x, y, &spatial).is_none());
        assert_eq!(sim.grid.get(x, y), Tile::Food);
        assert!(!sim.farms[0].harvested);
    }
}
