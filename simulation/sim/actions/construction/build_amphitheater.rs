//! Action 173: carve an amphitheater. Needs 1 stone.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.06);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("carving an amphitheater");
    ctx.discover("amphitheater", "carved an amphitheater");
    0.014
}
