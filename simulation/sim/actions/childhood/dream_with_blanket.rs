use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("dream with a blanket");
    ctx.event("chore", "dream with a blanket");
    0.03
}
