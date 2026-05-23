use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("timed the brew");
    ctx.event("chore", "timed the brew");
    0.04
}
