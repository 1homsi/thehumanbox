use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("pastry") == 0 {
        ctx.think("no pie to slice");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("slice pie");
    ctx.event("chore", "sliced pie");
    0.03
}
