
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("salting meat");
    ctx.discover("salt-curing", "learned to salt meat");
    0.006
}
