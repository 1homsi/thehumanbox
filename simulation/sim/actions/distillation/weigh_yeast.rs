use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("weigh yeast");
    ctx.event("chore", "weighed the yeast pitch");
    0.02
}
