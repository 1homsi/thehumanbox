use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || ctx.org().inv_food == 0 {
        return 0.0;
    }
    let o = ctx.org_mut();
    o.inv_food = o.inv_food.saturating_sub(1);
    o.energy = (o.energy + 0.20).min(1.0);
    o.comfort = (o.comfort + 0.04).min(1.0);
    let cur = o.tools.get("goat").copied().unwrap_or(0);
    o.tools.insert("goat".to_string(), (cur + 1).min(15));
    ctx.think("roast goat");
    ctx.event("life", "roasted goat");
    0.010
}
