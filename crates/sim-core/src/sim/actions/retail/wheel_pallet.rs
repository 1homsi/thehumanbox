use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("wheel a pallet");
    ctx.event("chore", "wheel a pallet");
    0.04
}
