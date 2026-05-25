use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near { return 0.0; }
    let o = ctx.org_mut();
    o.energy = (o.energy + 0.04).min(1.0);
    o.comfort = (o.comfort + 0.04).min(1.0);
    let cur = o.tools.get("saute_onion").copied().unwrap_or(0);
    o.tools.insert("saute_onion".to_string(), (cur + 1).min(15));
    ctx.think("saute saute_onion");
    ctx.event("life", "sauteed saute_onion");
    0.010
}
