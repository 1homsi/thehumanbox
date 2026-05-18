
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("no dispute to settle");
        return 0.0;
    }
    let lid = ctx.lid.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&lid, 0.05);
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.05).min(1.0);
        o.boredom = (o.boredom - 0.04).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    ctx.think("reconciling the family");
    ctx.event("social", "settled a family dispute and restored harmony");
    0.010
}
