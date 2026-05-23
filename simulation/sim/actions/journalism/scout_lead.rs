use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.4) { ctx.add_good("lead", 1); }
    ctx.add_literacy(0.004);
    ctx.think("scout a lead");
    ctx.event("chore", "scout a lead");
    0.04
}
