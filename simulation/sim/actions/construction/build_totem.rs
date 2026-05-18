

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.03);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("raising a totem");
    ctx.discover("totem", "carved a tribal totem");
    0.006
}
