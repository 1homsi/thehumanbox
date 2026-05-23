use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("bottle") == 0 {
        ctx.think("no bottle to cork");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("cork bottle");
    ctx.event("chore", "corked a bottle");
    0.03
}
