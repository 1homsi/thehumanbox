
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("grinding grain");
    ctx.discover("milling", "ground the first grain");
    0.003
}
