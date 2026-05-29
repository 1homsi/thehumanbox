use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("scribble a circle");
    ctx.event("chore", "scribble a circle");
    0.04
}
