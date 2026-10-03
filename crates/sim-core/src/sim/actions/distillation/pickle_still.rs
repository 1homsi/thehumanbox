use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.02);
    ctx.think("pickle still");
    ctx.event("chore", "pickled the still copper");
    0.03
}
