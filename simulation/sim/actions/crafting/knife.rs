//! Action 155: knap a knife.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("knife", 0.012);
    ctx.think("knapping a knife");
    r
}
