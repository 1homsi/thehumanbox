use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 || !ctx.fire_near {
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.06);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("building a forge");
    ctx.discover("metallurgy", "raised the first forge");
    0.014
}
