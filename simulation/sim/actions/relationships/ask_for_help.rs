//! Action 229: call a nearby kin to assist; boost their boredom reduction.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("calling for help but no one near");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.10).max(0.0);
        o.comfort = (o.comfort + 0.03).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("asking kin for help");
    ctx.event("social", "asked kin for assistance");
    0.005
}
