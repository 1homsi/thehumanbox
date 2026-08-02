use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.06).max(0.0);
    ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Grass);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.18);
    ctx.sim.grid.relieve_pressure(ctx.ix, ctx.iy, 0.70);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 1.0);
    ctx.think("sowing seeds in the ash-rich soil");
    ctx.discover(
        "land_restoration",
        "restored burned land by replanting and nurturing regrowth",
    );
    ctx.event(
        "build",
        "began restoring fire-scarred land by replanting vegetation",
    );
    0.022
}
