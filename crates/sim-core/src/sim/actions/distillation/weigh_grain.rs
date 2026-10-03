use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("weigh grain");
    ctx.event("chore", "weighed the grain bill");
    0.02
}
