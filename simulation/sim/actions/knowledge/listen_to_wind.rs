//! Action 130: listen to the wind.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().fear_level = (ctx.org().fear_level - 0.02).max(0.0);
    ctx.think("listening to the wind");
    ctx.discover("wind-lore", "read the winds");
    0.002
}
