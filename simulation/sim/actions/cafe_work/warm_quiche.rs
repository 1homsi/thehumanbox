use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("pastry") == 0 {
        ctx.think("nothing to warm");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("warm quiche");
    ctx.event("chore", "warmed quiche");
    0.03
}
