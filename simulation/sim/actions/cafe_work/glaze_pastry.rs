use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("pastry") == 0 {
        ctx.think("no pastry to glaze");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("glaze pastry");
    ctx.event("chore", "glazed a pastry");
    0.03
}
