use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    if ctx.chance(0.25) { ctx.add_good("lead", 1); }
    ctx.think("track a foia");
    ctx.event("chore", "track a foia");
    0.04
}
