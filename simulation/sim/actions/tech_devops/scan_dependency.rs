use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("scan dependencies");
    ctx.event("chore", "scan dependencies");
    0.04
}
