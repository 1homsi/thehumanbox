
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("no one to challenge");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.energy = (o.energy + 0.05).min(1.0);
        o.boredom = (o.boredom - 0.08).max(0.0);
    }
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.energy = (me.energy + 0.05).min(1.0);
        me.boredom = (me.boredom - 0.08).max(0.0);
    }
    ctx.think("playfully challenging a kin");
    ctx.event("social", "engaged in a friendly challenge with kin");
    0.006
}
