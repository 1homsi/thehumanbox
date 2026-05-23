use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.02);
    ctx.add_comfort(0.01);
    ctx.think("pray at a grave");
    ctx.event("chore", "prayed at a grave");
    0.04
}
