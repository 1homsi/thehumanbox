use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("name a color");
    ctx.event("chore", "name a color");
    0.04
}
