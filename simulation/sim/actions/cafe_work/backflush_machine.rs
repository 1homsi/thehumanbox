use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.01);
    ctx.add_literacy(0.002);
    ctx.think("backflush the machine");
    ctx.event("chore", "backflush the machine");
    0.03
}
