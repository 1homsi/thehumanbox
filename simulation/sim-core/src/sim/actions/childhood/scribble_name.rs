use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("scribble own name");
    ctx.event("chore", "scribble own name");
    0.04
}
