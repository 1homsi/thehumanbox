use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("backfill data");
    ctx.event("chore", "backfill data");
    0.05
}
