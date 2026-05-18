
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_food == 0 { return 0.0; }
    ctx.org_mut().inv_food += 1;
    ctx.think("drying fruit over the fire");
    ctx.discover("food_preservation", "preserved food by drying for the first time");
    0.008
}
