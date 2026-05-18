//! Action 139: watch clouds drift.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("watching the clouds drift");
    ctx.discover("cloud-lore", "learned cloud signs");
    0.002
}
