use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("scribble a line");
    ctx.event("chore", "scribble a line");
    0.04
}
