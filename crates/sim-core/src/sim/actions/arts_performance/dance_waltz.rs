use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 5).min(1200);
    let cur = o.tools.get("dance waltz").copied().unwrap_or(0);
    o.tools.insert("dance waltz".to_string(), (cur + 1).min(12));
    ctx.think("dance waltz");
    ctx.event("life", "dance waltz");
    0.008
}
