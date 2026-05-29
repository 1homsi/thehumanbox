use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("walkthrough close");
    ctx.event("chore", "did the closing walkthrough");
    0.03
}
