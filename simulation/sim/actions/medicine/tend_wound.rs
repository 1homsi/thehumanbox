
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_resource = ctx.sim.organisms[ctx.idx].inv_food > 0 || ctx.fire_near;
    if !has_resource {
        ctx.think("need food or fire to tend wounds");
        return 0.0;
    }
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.9);
    let Some(ki) = pick else {
        ctx.think("no wounded kin nearby");
        return 0.0;
    };
    if ctx.sim.organisms[ctx.idx].inv_food > 0 {
        ctx.sim.organisms[ctx.idx].inv_food -= 1;
    }
    ctx.sim.organisms[ki].health = (ctx.sim.organisms[ki].health + 0.05).min(1.0);
    ctx.think("tending a wound");
    ctx.event("medicine", "tended the wounds of a kin member");
    0.008
}
