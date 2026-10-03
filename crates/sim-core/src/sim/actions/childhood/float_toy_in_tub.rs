use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.025);
    ctx.think("float a toy in the tub");
    ctx.event("chore", "float a toy in the tub");
    0.03
}
