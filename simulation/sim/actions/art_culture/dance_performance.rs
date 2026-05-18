//! Action 321: dance performance with 2+ kin; comfort +0.05 all.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
        ctx.sim.organisms[ki].energy  = (ctx.sim.organisms[ki].energy  + 0.03).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.org_mut().energy  = (ctx.org().energy  + 0.03).min(1.0);
    ctx.think("dancing with the group");
    ctx.event("culture", "danced together in celebration");
    0.008
}
