use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("coffee") == 0 || ctx.good("pastry") == 0 {
        ctx.think("nothing to pair");
        return 0.005;
    }
    let n = ctx.comfort_kin(0.02);
    ctx.add_wealth(1);
    ctx.think("pair beans with pastry");
    ctx.event("chore", "paired beans with a pastry");
    0.05 + n as f32 * 0.005
}
