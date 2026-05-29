use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("bag lining");
    ctx.event("chore", "bagged lining");
    0.03
}
