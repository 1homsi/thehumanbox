//! Action 259: spiritual healing rite for a dying kin; health +0.06.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.3);
    let Some(ki) = pick else {
        ctx.think("no dying kin to heal");
        return 0.0;
    };
    ctx.sim.organisms[ki].health  = (ctx.sim.organisms[ki].health  + 0.06).min(1.0);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    ctx.sim.organisms[ctx.idx].energy = (ctx.sim.organisms[ctx.idx].energy - 0.05).max(0.0);
    ctx.think("performing a blood ritual healing");
    ctx.event("ritual", "performed a sacred healing rite for a dying kin");
    0.012
}
