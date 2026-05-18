//! Action 295: collect from kin (reduce one kin's inv_food); emit "governance" event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].inv_food > 1);
    let Some(ki) = pick else {
        ctx.think("no kin have food to tax");
        return 0.0;
    };
    ctx.sim.organisms[ki].inv_food -= 1;
    ctx.sim.organisms[ctx.idx].inv_food += 1;
    ctx.think("collecting taxes");
    ctx.event("governance", "levied a food tax from a tribe member");
    0.007
}
