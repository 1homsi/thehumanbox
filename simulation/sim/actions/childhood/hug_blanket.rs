use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("hug a blanket");
    ctx.event("chore", "hug a blanket");
    0.03
}
