
use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 1.8);
    ctx.sim.grid.add_structure(ix, iy, 0.015);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("claiming this land");
    ctx.discover("territory", "claimed new territory");
    0.004
}
