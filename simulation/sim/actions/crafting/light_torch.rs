//! Action 62: light a torch. Needs fire nearby OR wood in inventory.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near && ctx.org().inv_wood == 0 { return 0.0; }
    ctx.think("lighting a torch");
    ctx.discover("torch", "made a torch");
    0.006
}
