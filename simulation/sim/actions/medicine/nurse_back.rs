
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.7);
    let Some(ki) = pick else {
        ctx.think("all kin are healthy");
        return 0.0;
    };
    ctx.sim.organisms[ki].health = (ctx.sim.organisms[ki].health + 0.08).min(1.0);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("nursing kin back to health");
    ctx.event("medicine", "provided extended nursing care to a sick kin");
    0.010
}
