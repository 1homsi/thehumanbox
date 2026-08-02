use super::super::ctx::ActionCtx;
use crate::world::{
    grid::TrailKind,
    tiles::{Biome, Tile},
};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.05).max(0.0);
    ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Grass);
    ctx.sim.grid.set_biome(ctx.ix, ctx.iy, Biome::Grassland);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.18);
    ctx.sim.grid.relieve_pressure(ctx.ix, ctx.iy, 0.8);
    ctx.sim.grid.relieve_hazard(ctx.ix, ctx.iy, 0.12);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 1.2);
    ctx.think("reseeding fire-scarred ground as meadow");
    ctx.discover("meadow_restoration", "returned burned ground to living grassland");
    ctx.event("build", "restored a burned tile as fertile meadow habitat");
    0.024
}
