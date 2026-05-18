
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("sitting alone in silence");
        return 0.0;
    };
    ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.07).max(0.0);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.boredom = (me.boredom - 0.07).max(0.0);
        me.comfort = (me.comfort + 0.04).min(1.0);
    }
    ctx.think("sharing quiet companionship");
    0.005
}
