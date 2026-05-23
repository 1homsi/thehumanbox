use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("aged_spirit", 2) {
        ctx.think("not enough aged spirit to blend");
        return 0.005;
    }
    ctx.add_good("blended_spirit", 1);
    ctx.add_wealth(1);
    ctx.think("blend barrels");
    ctx.event("chore", "blended barrels");
    0.10
}
