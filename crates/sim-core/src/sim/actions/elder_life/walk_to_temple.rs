use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.01);
    ctx.add_comfort(0.02);
    ctx.think("walk to the temple");
    ctx.event("chore", "walked to the temple");
    0.03
}
