use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("hide in a blanket");
    ctx.event("chore", "hide in a blanket");
    0.03
}
