use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near { return 0.0; }
    let o = ctx.org_mut();
    o.energy = (o.energy + 0.04).min(1.0);
    o.comfort = (o.comfort + 0.04).min(1.0);
    let cur = o.tools.get("saute_spice").copied().unwrap_or(0);
    o.tools.insert("saute_spice".to_string(), (cur + 1).min(15));
    ctx.think("saute saute_spice");
    ctx.event("life", "sauteed saute_spice");
    0.010
}
