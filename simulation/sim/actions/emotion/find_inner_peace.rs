use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.kin.is_empty() || !ctx.near.is_empty() {
        ctx.think("too much noise to find stillness");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.09).min(1.0);
    o.sleep_debt = (o.sleep_debt - 0.05).max(0.0);
    ctx.think("at peace with the world");
    ctx.event("emotion", "found deep inner peace in a moment of solitude");
    0.012
}
