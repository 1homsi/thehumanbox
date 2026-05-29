use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.015);
    ctx.think("empty the trash");
    ctx.event("chore", "empty the trash");
    0.03
}
