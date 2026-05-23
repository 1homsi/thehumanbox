use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("weigh beans");
    ctx.event("chore", "weigh beans");
    0.04
}
