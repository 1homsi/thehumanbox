//! Action 63: shape clay into pottery.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("pottery", 0.010);
    ctx.think("shaping clay");
    r
}
