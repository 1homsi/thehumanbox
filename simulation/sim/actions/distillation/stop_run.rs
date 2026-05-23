use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.02);
    ctx.think("stop run");
    ctx.event("chore", "shut down the still");
    0.03
}
