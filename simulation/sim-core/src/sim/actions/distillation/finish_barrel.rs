use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("aged_spirit") == 0 {
        ctx.think("no barrel to finish");
        return 0.005;
    }
    ctx.add_wealth(1);
    ctx.think("finish barrel");
    ctx.event("chore", "finished a barrel");
    0.05
}
