use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.02);
    ctx.add_comfort(0.02);
    ctx.think("take a third step");
    ctx.event("chore", "take a third step");
    0.04
}
