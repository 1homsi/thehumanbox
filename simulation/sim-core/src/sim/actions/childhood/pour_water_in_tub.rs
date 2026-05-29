use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.025);
    ctx.think("pour water in the tub");
    ctx.event("chore", "pour water in the tub");
    0.03
}
