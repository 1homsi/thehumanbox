use super::super::ctx::ActionCtx;
use crate::world::{
    grid::TrailKind,
    tiles::{Biome, Tile},
};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.08).max(0.0);
    let mut restored = 0;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx.abs() + dy.abs() > 1 {
                continue;
            }
            let (x, y) = (ctx.ix + dx, ctx.iy + dy);
            if !matches!(ctx.sim.grid.get(x, y), Tile::Grass | Tile::Ash | Tile::Scorched) {
                continue;
            }
            let touches_water = crate::world::grid::WorldGrid::neighbors(x, y)
                .any(|(nx, ny)| ctx.sim.grid.get(nx, ny) == Tile::Water);
            if (dx != 0 || dy != 0) && !touches_water {
                continue;
            }
            ctx.sim.grid.set_biome(x, y, Biome::Forest);
            if matches!(ctx.sim.grid.get(x, y), Tile::Ash | Tile::Scorched) {
                ctx.sim.grid.set(x, y, Tile::Grass);
            }
            ctx.sim.grid.restore_fertility(x, y, 0.16);
            ctx.sim.grid.relieve_hazard(x, y, 0.10);
            ctx.sim.grid.leave_trail(x, y, TrailKind::Food, 0.65);
            restored += 1;
        }
    }
    ctx.think("replanting a wooded river margin");
    ctx.discover("riparian_restoration", "restored a living buffer along the water");
    ctx.event("build", &format!("restored {restored} riverbank habitat tiles"));
    0.018 + restored as f32 * 0.006
}
