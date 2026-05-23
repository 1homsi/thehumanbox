use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("carve on the porch");
    ctx.event("chore", "carve on the porch");
    0.04
}
