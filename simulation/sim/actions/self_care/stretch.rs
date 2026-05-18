//! Action 109: stretch.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.boredom = (o.boredom - 0.05).max(0.0);
    o.energy = (o.energy + 0.02).min(1.0);
    ctx.think("stretching");
    0.002
}
