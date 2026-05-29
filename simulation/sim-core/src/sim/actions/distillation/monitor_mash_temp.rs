use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("nothing fermenting");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("monitor mash temp");
    ctx.event("chore", "checked mash temperature");
    0.03
}
