
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().health = (ctx.org().health + 0.02).min(1.0);
    ctx.think("caring for animals");
    0.005
}
