use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.infection = (me.infection - 0.05).max(0.0);
        me.health = (me.health + 0.02).min(1.0);
    }
    ctx.think("staying healthy");
    0.005
}
