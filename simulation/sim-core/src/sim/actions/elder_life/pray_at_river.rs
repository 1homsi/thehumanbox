use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.02);
    ctx.add_comfort(0.01);
    ctx.think("pray at the river");
    ctx.event("chore", "prayed at the river");
    0.04
}
