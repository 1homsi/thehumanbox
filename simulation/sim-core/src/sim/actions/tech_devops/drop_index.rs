use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("drop an index");
    ctx.event("chore", "drop an index");
    0.05
}
