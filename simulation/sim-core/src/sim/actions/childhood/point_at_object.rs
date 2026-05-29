use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("point at an object");
    ctx.event("chore", "point at an object");
    0.04
}
