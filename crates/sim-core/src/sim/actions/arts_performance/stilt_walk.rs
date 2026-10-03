use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 5).min(1200);
    let cur = o.tools.get("stilt walk").copied().unwrap_or(0);
    o.tools.insert("stilt walk".to_string(), (cur + 1).min(12));
    ctx.think("stilt walk");
    ctx.event("life", "stilt walk");
    0.008
}
