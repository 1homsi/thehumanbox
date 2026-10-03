use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to build an endcap");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("build an endcap");
    ctx.event("chore", "build an endcap");
    0.03
}
