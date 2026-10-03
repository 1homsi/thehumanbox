use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.01);
    ctx.think("naming this place");
    ctx.discover("place-names", "named a landmark");
    0.003
}
