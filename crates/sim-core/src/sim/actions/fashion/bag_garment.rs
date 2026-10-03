use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("garment", 1) {
        ctx.think("no garment to bag");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("bag garment");
    ctx.event("life", "sold a garment");
    0.08
}
