use super::super::ctx::ActionCtx;
use crate::sim::civ::trade_routes::dispatch_caravan_on_route;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if dispatch_caravan_on_route(ctx.sim, ctx.idx) {
        ctx.think("dispatching specialist cargo along an established trade route");
        return 0.008;
    }

    ctx.think("no established route can carry the available cargo");
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::buildings::{Building, BuildingKind};
    use crate::sim::civ::trade_routes::establish_route;
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;

    fn completed_hut(id: u32, lineage_id: &str, x: i32, y: i32) -> Building {
        let mut building = Building::new(id, BuildingKind::Hut, x, y, Some(lineage_id.into()), 1);
        building.condition = 1.0;
        building
    }

    fn specialist_trade_sim() -> Simulation {
        let mut sim = Simulation::new(0x2704);
        sim.organisms.truncate(2);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            let river = index == 0;
            organism.alive = true;
            organism.lineage_id = if river { "river" } else { "hill" }.into();
            organism.x = if river { 100.0 } else { 220.0 };
            organism.y = if river { 100.0 } else { 160.0 };
            organism.home_x = organism.x;
            organism.home_y = organism.y;
            organism.inv_food = 0;
            organism.inv_water = 0;
            organism.inv_wood = 0;
            organism.inv_stone = 0;
            organism.tools.clear();
        }
        sim.organisms[0].inv_wood = 3;
        sim.buildings.clear();
        sim.buildings.push(completed_hut(1, "river", 100, 100));
        sim.buildings.push(completed_hut(2, "hill", 220, 160));
        sim
    }

    #[test]
    fn specialist_dispatch_requires_and_uses_a_persistent_route() {
        let mut sim = specialist_trade_sim();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let unavailable_reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, 100, 100, &spatial);
            apply(&mut ctx)
        };
        assert_eq!(unavailable_reward, 0.0);
        assert_eq!(sim.organisms[0].inv_wood, 3);
        assert!(sim.caravans.is_empty());

        assert!(establish_route(&mut sim, 0, 1));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let dispatch_reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, 100, 100, &spatial);
            apply(&mut ctx)
        };

        assert!(dispatch_reward > 0.0);
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.caravans.len(), 1);
        assert_eq!(sim.caravans[0].cargo, "wood");
        assert_eq!(sim.caravans[0].amount, 3);
    }
}
