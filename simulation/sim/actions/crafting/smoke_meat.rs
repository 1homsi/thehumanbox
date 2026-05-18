
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("smoking meat");
    ctx.discover("preservation", "learned to preserve food");
    0.008
}
