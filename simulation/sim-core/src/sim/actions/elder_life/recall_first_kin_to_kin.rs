use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no one to tell");
        return 0.02;
    }
    let n = ctx.comfort_kin(0.02);
    ctx.literacy_kin(0.003);
    ctx.think("recall the first kin met");
    ctx.event("chore", "recall the first kin met");
    0.04 + n as f32 * 0.005
}
