use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() {
        ctx.think("bedtime stories are for night");
        return 0.0;
    }
    if ctx.kin.is_empty() {
        ctx.think("no family to tell stories to");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.sleep_debt = (o.sleep_debt - 0.06).max(0.0);
        o.comfort = (o.comfort + 0.04).min(1.0);
        o.boredom = (o.boredom - 0.05).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("telling a bedtime story");
    ctx.event("social", "lulled the family to sleep with a bedtime story");
    bonus + 0.004
}
