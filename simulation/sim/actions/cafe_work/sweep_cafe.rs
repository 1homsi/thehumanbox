use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.01);
    ctx.add_literacy(0.002);
    ctx.think("sweep the cafe");
    ctx.event("chore", "sweep the cafe");
    0.03
}
