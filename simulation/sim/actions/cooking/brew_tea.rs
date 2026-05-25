
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_water == 0 { return 0.0; }
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.04).min(1.0);
    o.boredom = (o.boredom - 0.05).max(0.0);
    o.fear_level = (o.fear_level - 0.02).max(0.0);
    o.sleep_debt = (o.sleep_debt - 0.05).max(0.0);
    ctx.think("brewing tea");
    ctx.discover("tea", "brewed the first tea");
    0.004
}
