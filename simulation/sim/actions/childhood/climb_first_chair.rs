use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.02);
    ctx.add_comfort(0.02);
    ctx.think("climb a chair");
    ctx.event("chore", "climb a chair");
    0.04
}
