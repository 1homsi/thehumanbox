
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder {
        ctx.think("only an elder may issue a decree");
        return 0.0;
    }
    if ctx.kin.is_empty() {
        ctx.think("no one to hear the decree");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.05).max(0.0);
    }
    ctx.think("issuing a decree");
    ctx.event("governance", "issued an elder's decree to the assembled tribe");
    0.008
}
