use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("name an animal");
    ctx.event("chore", "name an animal");
    0.04
}
