use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("grind beans");
    ctx.event("chore", "grind beans");
    0.04
}
