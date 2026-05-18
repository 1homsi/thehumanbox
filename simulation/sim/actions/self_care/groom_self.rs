//! Action 111: groom self.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.infection = (o.infection * 0.94).max(0.0);
    o.comfort = (o.comfort + 0.02).min(1.0);
    ctx.think("grooming");
    0.002
}
