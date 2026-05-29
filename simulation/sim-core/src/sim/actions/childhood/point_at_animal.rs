use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("point at an animal");
    ctx.event("chore", "point at an animal");
    0.04
}
