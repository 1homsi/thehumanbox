use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.add_comfort(0.01);
    ctx.think("hold a cup");
    ctx.event("chore", "hold a cup");
    0.03
}
