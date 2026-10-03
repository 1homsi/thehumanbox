use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("count the safe");
    ctx.event("chore", "count the safe");
    0.04
}
