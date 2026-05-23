use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.03);
    ctx.think("eat with hands");
    ctx.event("chore", "ate with hands");
    0.04
}
