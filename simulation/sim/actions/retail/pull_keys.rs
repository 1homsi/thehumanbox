use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.003);
    ctx.think("pull keys");
    ctx.event("chore", "pulled the keys");
    0.02
}
