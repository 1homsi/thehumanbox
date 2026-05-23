use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    if ctx.chance(0.25) { ctx.add_good("lead", 1); }
    ctx.think("request court records");
    ctx.event("chore", "request court records");
    0.04
}
