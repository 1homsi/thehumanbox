use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("drink", 1) {
        ctx.think("no drink to serve");
        return 0.005;
    }
    let n = ctx.energize_kin(0.04);
    ctx.comfort_kin(0.02);
    ctx.add_wealth(2);
    ctx.think("lungo");
    ctx.event("chore", "served a lungo");
    0.07 + n as f32 * 0.01
}
