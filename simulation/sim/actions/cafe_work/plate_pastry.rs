use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("pastry", 1) {
        ctx.think("no pastry to plate");
        return 0.005;
    }
    ctx.add_wealth(1);
    ctx.energize_kin(0.02);
    ctx.think("plate pastry");
    ctx.event("chore", "plated a pastry");
    0.05
}
