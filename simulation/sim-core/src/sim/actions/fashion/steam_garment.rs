use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment to steam");
        return 0.005;
    }
    let n = ctx.comfort_kin(0.01);
    ctx.add_comfort(0.02);
    ctx.think("steam garment");
    ctx.event("chore", "steamed a garment");
    0.04 + n as f32 * 0.003
}
