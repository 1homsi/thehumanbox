use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_food == 0 {
        return 0.0;
    }
    let o = ctx.org_mut();
    o.energy = (o.energy + 0.18).min(1.0);
    let cur = o.tools.get("bread").copied().unwrap_or(0);
    o.tools.insert("bread".to_string(), (cur + 1).min(20));
    ctx.think("baking bread");
    ctx.discover("bread", "baked the first bread");
    0.012
}
