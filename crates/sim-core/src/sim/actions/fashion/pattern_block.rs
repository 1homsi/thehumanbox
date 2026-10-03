use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("pattern block");
    ctx.event("chore", "drew a pattern block");
    0.03
}
