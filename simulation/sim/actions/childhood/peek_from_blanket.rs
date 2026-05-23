use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("peek from a blanket");
    ctx.event("chore", "peek from a blanket");
    0.03
}
