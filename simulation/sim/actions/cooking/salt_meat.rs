
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().inv_food == 0 { return 0.0; }
    let o = ctx.org_mut();
    let cur = o.tools.get("preserved").copied().unwrap_or(0);
    o.tools.insert("preserved".to_string(), cur + 1);
    ctx.think("salting meat");
    ctx.discover("salt-curing", "learned to salt meat");
    0.008
}
