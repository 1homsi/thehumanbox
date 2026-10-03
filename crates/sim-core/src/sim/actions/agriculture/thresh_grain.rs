use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy + 0.15).min(1.0);
    ctx.think("threshing grain");
    ctx.discover("threshing", "separated grain from chaff for the first time");
    0.008
}
