use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("restock napkins");
    ctx.event("chore", "restock napkins");
    0.03
}
