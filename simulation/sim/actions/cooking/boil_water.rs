//! Action 141: boil water clean. Knocks down infection.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_water == 0 { return 0.0; }
    let o = ctx.org_mut();
    o.infection = (o.infection * 0.80).max(0.0);
    ctx.think("boiling water clean");
    ctx.discover("sanitation", "learned to boil water");
    0.005
}
