use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.002);
    ctx.think("tape receipt");
    ctx.event("chore", "taped a receipt");
    0.02
}
