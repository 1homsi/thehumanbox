use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("run a photo");
    ctx.event("chore", "run a photo");
    0.03
}
