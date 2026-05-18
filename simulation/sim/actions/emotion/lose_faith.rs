
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort - 0.06).max(0.0);
    o.boredom = (o.boredom + 0.08).min(1.0);
    ctx.think("questioning everything");
    ctx.event("emotion", "lost faith and fell into doubt");
    0.003
}
