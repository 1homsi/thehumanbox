use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("watch the river");
    ctx.event("chore", "watched the river pass");
    0.03
}
