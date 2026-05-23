use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to rotate stock");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("rotate stock");
    ctx.event("chore", "rotate stock");
    0.03
}
