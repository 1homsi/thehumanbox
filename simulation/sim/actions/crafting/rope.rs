//! Action 64: twist rope.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("rope", 0.008);
    ctx.think("twisting rope");
    r
}
