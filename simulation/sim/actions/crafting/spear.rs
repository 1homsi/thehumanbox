//! Action 51: knap a spear.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("spear", 0.014);
    ctx.think("knapping a spear");
    r
}
