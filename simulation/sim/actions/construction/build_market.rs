use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() || (ctx.org().inv_wood == 0 && ctx.org().inv_stone == 0) {
        return 0.0;
    }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.05);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("setting up a market");
    ctx.discover("markets", "founded a market");
    0.012
}
