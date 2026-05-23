use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.03);
    ctx.add_literacy(0.003);
    ctx.think("eat with spoon");
    ctx.event("chore", "ate with a spoon");
    0.05
}
