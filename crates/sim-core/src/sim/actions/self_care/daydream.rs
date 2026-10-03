use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.boredom = (o.boredom - 0.04).max(0.0);
    o.comfort = (o.comfort + 0.02).min(1.0);
    ctx.think("daydreaming");
    0.002
}
