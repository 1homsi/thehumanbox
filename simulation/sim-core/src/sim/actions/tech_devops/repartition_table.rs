use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("repartition a table");
    ctx.event("chore", "repartition a table");
    0.05
}
