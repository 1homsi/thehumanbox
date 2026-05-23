use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("restock pastry");
    ctx.event("chore", "restock pastry");
    0.03
}
