use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy - 0.08).max(0.0);
    ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Scorched);
    *ctx.sim.grid.fire_intensity_mut(ctx.ix, ctx.iy) = 0.0;
    ctx.sim.grid.relieve_pressure(ctx.ix, ctx.iy, 1.5);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.08);
    ctx.think("setting a careful, directed burn");
    ctx.discover("controlled_burn", "used fire deliberately to renew the land");
    ctx.event(
        "build",
        "burned a contained patch into a temporary firebreak and enriched its soil",
    );
    0.020
}
