use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.003);
    ctx.think("disarm alarm");
    ctx.event("chore", "disarmed the alarm");
    0.03
}
