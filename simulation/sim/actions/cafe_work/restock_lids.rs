use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("restock lids");
    ctx.event("chore", "restock lids");
    0.03
}
