
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.boredom = (o.boredom - 0.1).max(0.0);
    o.comfort = (o.comfort + 0.04).min(1.0);
    ctx.think("breathing deep");
    0.005
}
