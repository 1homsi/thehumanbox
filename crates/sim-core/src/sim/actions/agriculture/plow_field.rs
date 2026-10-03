use super::super::ctx::ActionCtx;
use super::farm_ops;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if farm_ops::prepare_plot(ctx.sim, ctx.idx, ctx.ix, ctx.iy).is_none() {
        return 0.0;
    }
    ctx.think("plowing the field");
    ctx.discover("plowing", "broke the first ground for farming");
    ctx.event("build", "plowed a field for cultivation");
    0.008
}
