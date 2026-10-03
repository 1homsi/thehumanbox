use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to cross-sell");
        return 0.005;
    }
    let n = ctx.comfort_kin(0.01);
    ctx.add_literacy(0.003);
    ctx.think("cross-sell");
    ctx.event("chore", "cross-sold");
    0.04 + n as f32 * 0.005
}
