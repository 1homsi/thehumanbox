use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("refuse to share");
    ctx.event("chore", "refused to share");
    0.02
}
