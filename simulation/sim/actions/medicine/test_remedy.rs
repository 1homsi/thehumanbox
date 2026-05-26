use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("need plants to experiment with");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    ctx.think("testing a remedy");
    if ctx.chance(0.35) {
        ctx.sim.organisms[ctx.idx].infection = (ctx.sim.organisms[ctx.idx].infection - 0.08).max(0.0);
        ctx.discover("antidote", "discovered an antidote through experimentation");
        0.020
    } else {
        ctx.event("medicine", "experimented with plants but found nothing new");
        0.003
    }
}
