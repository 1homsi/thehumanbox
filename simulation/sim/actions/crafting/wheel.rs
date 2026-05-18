//! Action 163: round a wheel.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("wheel", 0.020);
    ctx.think("rounding a wheel");
    r
}
