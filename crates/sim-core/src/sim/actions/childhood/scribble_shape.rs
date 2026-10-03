use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("scribble a shape");
    ctx.event("chore", "scribble a shape");
    0.04
}
