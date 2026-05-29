use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("split the safe");
    ctx.event("chore", "split the safe");
    0.04
}
