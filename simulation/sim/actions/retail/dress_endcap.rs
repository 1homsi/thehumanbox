use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to dress an endcap");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("dress an endcap");
    ctx.event("chore", "dress an endcap");
    0.03
}
