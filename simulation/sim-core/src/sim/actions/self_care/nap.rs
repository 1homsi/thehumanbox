use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.sleep_debt = (o.sleep_debt - 0.15).max(0.0);
    o.energy = (o.energy + 0.06).min(1.0);
    ctx.think("taking a nap");
    0.003
}
