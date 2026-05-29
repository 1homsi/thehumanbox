use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 5).min(1200);
    let cur = o.tools.get("teach customer taste").copied().unwrap_or(0);
    o.tools
        .insert("teach customer taste".to_string(), (cur + 1).min(12));
    ctx.think("teach customer taste");
    ctx.event("life", "teach customer taste");
    0.008
}
