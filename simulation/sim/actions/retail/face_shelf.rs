use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("face shelves");
    ctx.event("chore", "face shelves");
    0.04
}
