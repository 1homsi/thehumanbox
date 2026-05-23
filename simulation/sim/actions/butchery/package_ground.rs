use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("preserved", 1) {
        ctx.think("no preserved cuts to package");
        return 0.005;
    }
    ctx.add_wealth(1);
    ctx.think("package ground");
    ctx.event("life", "sold packaged ground");
    0.07
}
