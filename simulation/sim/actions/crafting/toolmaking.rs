//! Action 55: knap stone tools.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("toolmaking", 0.014);
    ctx.think("knapping stone tools");
    r
}
