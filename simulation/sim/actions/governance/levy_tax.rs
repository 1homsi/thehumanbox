
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].inv_food > 1);
    let Some(ki) = pick else {
        ctx.think("no kin have food to levy");
        return 0.0;
    };
    ctx.sim.organisms[ki].inv_food -= 1;
    ctx.sim.organisms[ctx.idx].inv_food += 1;
    ctx.think("levying a tax");
    ctx.event("governance", "collected a food levy from tribe members");
    0.006
}
