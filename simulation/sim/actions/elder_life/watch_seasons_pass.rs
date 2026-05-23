use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("watch the seasons");
    ctx.event("chore", "watched the seasons pass");
    0.03
}
