
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].comfort < 0.3);
    let Some(ki) = pick else {
        ctx.think("no law-breakers among kin");
        return 0.0;
    };
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort - 0.03).max(0.0);
    ctx.think("enforcing the law");
    ctx.event("governance", "scolded a kin member for disorderly behavior");
    0.005
}
