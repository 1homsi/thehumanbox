
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].energy < 0.3 {
        ctx.think("too weak to fast");
        return 0.0;
    }
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.energy = (me.energy - 0.06).max(0.0);
        me.health = (me.health + 0.06).min(1.0);
        me.infection = (me.infection - 0.05).max(0.0);
    }
    ctx.think("fasting for healing");
    0.007
}
