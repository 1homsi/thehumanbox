use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin nearby");
        return 0.02;
    }
    let n = ctx.literacy_kin(0.005);
    ctx.comfort_kin(0.02);
    ctx.think("teach a grandchild a song");
    ctx.event("chore", "teach a grandchild a song");
    0.05 + n as f32 * 0.01
}
