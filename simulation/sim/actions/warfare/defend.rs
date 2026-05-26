use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.health = (o.health + 0.02).min(1.0);
    ctx.think("holding the line");
    0.003
}
