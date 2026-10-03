use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("bottle") == 0 {
        ctx.think("no bottle to wax");
        return 0.005;
    }
    ctx.add_comfort(0.01);
    ctx.think("wax bottle");
    ctx.event("chore", "waxed a bottle");
    0.03
}
