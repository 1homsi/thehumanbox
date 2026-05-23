use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.add_comfort(0.01);
    ctx.think("hold a spoon");
    ctx.event("chore", "hold a spoon");
    0.03
}
