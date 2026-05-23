use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no one to tell");
        return 0.02;
    }
    let n = ctx.comfort_kin(0.02);
    ctx.literacy_kin(0.003);
    ctx.think("recall courting");
    ctx.event("chore", "recall courting");
    0.04 + n as f32 * 0.005
}
