use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("stock shelves");
    ctx.event("chore", "stock shelves");
    0.04
}
