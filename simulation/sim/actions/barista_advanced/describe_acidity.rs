use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("describe acidity");
    ctx.event("chore", "described acidity");
    0.04
}
