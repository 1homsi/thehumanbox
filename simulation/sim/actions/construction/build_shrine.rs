

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.04);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("building a shrine");
    ctx.discover("religion", "built a shrine");
    0.008
}
