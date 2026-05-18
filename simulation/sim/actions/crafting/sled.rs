//! Action 162: lash a sled.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("sled", 0.010);
    ctx.think("lashing a sled");
    r
}
