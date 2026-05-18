
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("grateful but alone");
        return 0.0;
    };
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    ctx.think("expressing gratitude");
    ctx.event("social", "expressed heartfelt gratitude to kin");
    0.006
}
