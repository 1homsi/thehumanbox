use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.01);
    ctx.add_comfort(0.02);
    ctx.think("walk to a grave");
    ctx.event("chore", "walked to a grave");
    0.03
}
