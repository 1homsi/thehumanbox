
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.comfort = (me.comfort - 0.10).max(0.0);
        me.boredom = (me.boredom - 0.05).max(0.0);
    }
    ctx.think("mourning a lost child");
    ctx.event("death", "mourned the loss of a young kin member");
    0.004
}
