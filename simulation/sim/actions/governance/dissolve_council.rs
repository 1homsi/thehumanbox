use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder {
        ctx.think("lacks authority to dissolve the council");
        return 0.0;
    }
    ctx.think("dissolving the council");
    ctx.event("governance", "dissolved the tribal council by decree");
    0.005
}
