//! Action 110: bask in the sun. Daytime only.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.is_night() {
        ctx.think("waiting for the sun");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.04).min(1.0);
    o.energy = (o.energy + 0.015).min(1.0);
    ctx.think("basking in the sun");
    0.002
}
