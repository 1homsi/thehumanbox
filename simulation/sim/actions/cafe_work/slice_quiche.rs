use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("pastry") == 0 {
        ctx.think("no quiche to slice");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("slice quiche");
    ctx.event("chore", "sliced quiche");
    0.03
}
