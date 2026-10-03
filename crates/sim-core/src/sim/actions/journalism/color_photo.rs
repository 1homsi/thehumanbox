use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("color-correct a photo");
    ctx.event("chore", "color-correct a photo");
    0.03
}
