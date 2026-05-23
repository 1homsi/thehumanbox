use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("read on the porch");
    ctx.event("chore", "read on the porch");
    0.04
}
