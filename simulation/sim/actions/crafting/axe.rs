//! Action 156: haft an axe.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("axe", 0.014);
    ctx.think("hafting an axe");
    r
}
