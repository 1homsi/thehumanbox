
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.boredom = (me.boredom - 0.08).max(0.0);
        me.comfort = (me.comfort + 0.05).min(1.0);
    }
    if let Some(&ki) = ctx.kin.first() {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    }
    ctx.think("asking for forgiveness");
    ctx.event("social", "humbly asked for forgiveness");
    0.006
}
