//! Action 39: build a wall. Consumes 1 unit of stone or wood,
//! bumps structure on this tile.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_mat = ctx.org().inv_stone > 0 || ctx.org().inv_wood > 0;
    if !has_mat { return 0.0; }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.06);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("raising a wall");
    ctx.discover("walls", "built the first wall");
    0.012
}
