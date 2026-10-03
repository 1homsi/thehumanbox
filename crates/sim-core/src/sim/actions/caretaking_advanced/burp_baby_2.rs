use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 5).min(1200);
    let cur = o.tools.get("2").copied().unwrap_or(0);
    o.tools.insert("2".to_string(), (cur + 1).min(12));
    ctx.think("burp baby 2");
    ctx.event("life", "burp baby 2");
    0.008
}
