use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.fear_level = (o.fear_level - 0.04).max(0.0);
    ctx.think("falling back to safety");
    0.002
}
