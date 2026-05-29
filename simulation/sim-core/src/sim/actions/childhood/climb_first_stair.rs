use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_energy(0.02);
    ctx.add_comfort(0.02);
    ctx.think("climb a stair");
    ctx.event("chore", "climb a stair");
    0.04
}
