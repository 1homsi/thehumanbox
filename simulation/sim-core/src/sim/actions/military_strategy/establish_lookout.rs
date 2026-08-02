use super::super::construction::{start_project, ProjectSpec};
use super::super::ctx::ActionCtx;
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near && !ctx.water_near {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Watchtower,
            thought: "establishing a lookout post for early warning",
            reward: 0.012,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        sim::{simulation::Simulation, spatial::SpatialIndex},
        world::tiles::Tile,
    };

    #[test]
    fn establishing_lookout_opens_a_paid_saved_project_without_free_discovery() {
        let (x, y) = (140, 140);
        let mut sim = Simulation::new(0x100C_0A71);
        sim.buildings.clear();
        sim.organisms.truncate(1);
        sim.organisms[0].alive = true;
        sim.organisms[0].age = sim.organisms[0].max_age / 2;
        sim.organisms[0].energy = 1.0;
        sim.organisms[0].health = 1.0;
        sim.organisms[0].x = x as f32;
        sim.organisms[0].y = y as f32;
        for tile_y in y - 2..=y + 5 {
            for tile_x in x - 2..=x + 5 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }
        sim.grid.set(x - 1, y, Tile::Rock);
        let cost = BuildingKind::Watchtower.construction_cost();

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(&mut ctx)
        };
        assert_eq!(reward, 0.0);
        assert!(sim.buildings.is_empty());

        sim.organisms[0].inv_wood = cost.wood as u8;
        sim.organisms[0].inv_stone = cost.stone as u8;
        sim.organisms[0].wealth = cost.wealth;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(&mut ctx)
        };

        assert!(reward > 0.0);
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.organisms[0].inv_stone, 0);
        assert_eq!(sim.buildings.len(), 1);
        assert_eq!(sim.buildings[0].kind, BuildingKind::Watchtower);
        assert!(!sim.buildings[0].is_operational());
        assert!(!sim.organisms[0].discoveries.contains("lookout_post"));
        assert!(!sim.organisms[0].discoveries.contains("scouting"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.buildings.len(), 1);
        assert_eq!(loaded.buildings[0].kind, BuildingKind::Watchtower);
        assert!(!loaded.buildings[0].is_operational());
    }
}
