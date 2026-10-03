use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("count drawer");
    ctx.event("chore", "count drawer");
    0.04
}
