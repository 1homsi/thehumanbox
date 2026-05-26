use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_water == 0 {
        return 0.0;
    }
    let o = ctx.org_mut();
    o.infection = (o.infection * 0.75).max(0.0);
    o.hydration = (o.hydration + 0.06).min(1.0);
    ctx.think("boiling water clean");
    ctx.discover("sanitation", "learned to boil water");
    0.007
}
