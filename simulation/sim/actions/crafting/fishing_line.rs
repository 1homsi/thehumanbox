//! Action 154: twist a fishing line.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("fishing-line", 0.008);
    ctx.think("twisting a fishing line");
    r
}
