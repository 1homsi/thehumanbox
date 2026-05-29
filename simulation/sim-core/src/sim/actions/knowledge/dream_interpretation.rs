use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.fear_level = (o.fear_level - 0.04).max(0.0);
    o.comfort = (o.comfort + 0.03).min(1.0);
    ctx.think("interpreting a dream");
    ctx.discover("oneiromancy", "interpreted a dream");
    0.002
}
