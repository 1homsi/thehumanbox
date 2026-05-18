//! Action 164: set up a loom.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("loom", 0.014);
    ctx.think("setting up a loom");
    r
}
