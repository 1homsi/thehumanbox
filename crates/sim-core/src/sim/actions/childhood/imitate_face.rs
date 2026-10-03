use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("imitate a face");
    ctx.event("chore", "imitate a face");
    0.04
}
