use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("walkthrough open");
    ctx.event("chore", "did the opening walkthrough");
    0.03
}
