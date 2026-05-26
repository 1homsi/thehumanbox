use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.06).min(1.0);
        o.boredom = (o.boredom - 0.10).max(0.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    let bonus = 0.005 * ctx.kin.len().min(5) as f32;
    ctx.think("celebrating");
    if !ctx.kin.is_empty() {
        ctx.event("social", "led a celebration");
    }
    bonus
}
