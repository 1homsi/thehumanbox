use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("restock cups");
    ctx.event("chore", "restock cups");
    0.03
}
