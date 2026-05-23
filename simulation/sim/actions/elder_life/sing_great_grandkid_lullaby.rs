use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin nearby");
        return 0.02;
    }
    let n = ctx.literacy_kin(0.005);
    ctx.comfort_kin(0.02);
    ctx.think("sing a grandchild a lullaby");
    ctx.event("chore", "sing a grandchild a lullaby");
    0.05 + n as f32 * 0.01
}
