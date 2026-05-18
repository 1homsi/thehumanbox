//! Action 244: declare love to a kin; big comfort boost, emit bond event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("longing for connection");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.12).min(1.0);
        o.boredom = (o.boredom - 0.06).max(0.0);
    }
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.comfort = (me.comfort + 0.10).min(1.0);
        me.boredom = (me.boredom - 0.05).max(0.0);
    }
    ctx.think("declaring love");
    ctx.event("bond", "declared deep love for a kin member");
    0.012
}
