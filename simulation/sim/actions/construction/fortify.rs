//! Action 50: fortify the camp.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.05);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("fortifying the camp");
    ctx.discover("fortification", "fortified the camp");
    0.008
}
