//! Action 68: watch the stars at night.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() {
        ctx.think("waiting for night");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.think("watching the stars");
    ctx.discover("astronomy", "began mapping the stars");
    0.004
}
