use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("rock on the porch");
    ctx.event("chore", "rock on the porch");
    0.04
}
