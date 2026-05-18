//! Action 57: tan a hide.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("leatherwork", 0.010);
    ctx.think("tanning a hide");
    r
}
