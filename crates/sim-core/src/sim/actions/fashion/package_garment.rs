use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("garment", 1) {
        ctx.think("no garment to package");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("package garment");
    ctx.event("life", "packaged a garment for sale");
    0.08
}
