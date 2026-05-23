use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no mash to sparge");
        return 0.005;
    }
    if ctx.chance(0.25) { ctx.add_good("mash", 1); }
    ctx.add_literacy(0.004);
    ctx.think("sparge mash");
    ctx.event("chore", "sparged the mash");
    0.04
}
