use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 || !ctx.fire_near {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.think("fermenting grain");
    ctx.discover("grain_fermentation", "fermented grain for the first time");
    0.008
}
