use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("preserved", 1) {
        ctx.think("no preserved cuts to package");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("package steaks");
    ctx.event("life", "sold packaged steaks");
    0.08
}
