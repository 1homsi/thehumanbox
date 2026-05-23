use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.02);
    ctx.add_comfort(0.02);
    ctx.think("take a second step");
    ctx.event("chore", "take a second step");
    0.04
}
