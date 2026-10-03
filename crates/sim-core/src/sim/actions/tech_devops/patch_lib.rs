use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("patch a library");
    ctx.event("chore", "patch a library");
    0.04
}
