use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to return overstock");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("return overstock");
    ctx.event("chore", "return overstock");
    0.03
}
