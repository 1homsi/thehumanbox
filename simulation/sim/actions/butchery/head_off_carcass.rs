use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("no carcass to dress");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("remove the head");
    ctx.event("chore", "took the head off a carcass");
    0.04
}
