use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 {
        ctx.think("nothing to cut");
        return 0.005;
    }
    if ctx.chance(0.4) {
        ctx.add_good("spirit", 1);
    }
    ctx.add_literacy(0.005);
    ctx.think("cut tails");
    ctx.event("chore", "drew off the tails");
    0.04
}
