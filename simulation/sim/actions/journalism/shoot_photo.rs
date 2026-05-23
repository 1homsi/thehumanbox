use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("shoot a photo");
    ctx.event("chore", "shoot a photo");
    0.03
}
