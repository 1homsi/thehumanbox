use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.sleep_debt = (o.sleep_debt - 0.20).max(0.0);
    o.energy = (o.energy + 0.04).min(1.0);
    ctx.think("resting deeply");
    0.003
}
