use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 5).min(1200);
    let cur = o.tools.get("scrape propolis").copied().unwrap_or(0);
    o.tools.insert("scrape propolis".to_string(), (cur + 1).min(12));
    ctx.think("scrape propolis");
    ctx.event("life", "scrape propolis");
    0.008
}
