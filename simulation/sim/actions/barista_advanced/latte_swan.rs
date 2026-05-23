use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 || ctx.good("milk") == 0 {
        ctx.think("no drink to pour");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.add_comfort(0.02);
    let n = ctx.comfort_kin(0.01);
    ctx.think("swan");
    ctx.event("chore", "poured a swan");
    0.05 + n as f32 * 0.005
}
