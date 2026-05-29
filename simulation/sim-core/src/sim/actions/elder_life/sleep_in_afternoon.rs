use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.04);
    ctx.add_comfort(0.02);
    ctx.think("nap in the afternoon");
    ctx.event("chore", "nap in the afternoon");
    0.04
}
