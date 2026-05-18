//! Action 205: vision quest. 10% chance to find a vision.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.sleep_debt = (o.sleep_debt - 0.10).max(0.0);
    o.fear_level = (o.fear_level - 0.08).max(0.0);
    o.comfort = (o.comfort + 0.06).min(1.0);
    ctx.think("on a vision quest");
    if ctx.chance(0.10) {
        ctx.discover("vision", "returned with a vision");
    }
    0.005
}
