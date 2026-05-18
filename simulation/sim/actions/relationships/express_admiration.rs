//! Action 237: praise a kin's traits; boost their comfort.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("admiring from afar");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.08).min(1.0);
        o.boredom = (o.boredom - 0.05).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("expressing admiration");
    ctx.event("social", "praised a kin member's qualities");
    0.006
}
