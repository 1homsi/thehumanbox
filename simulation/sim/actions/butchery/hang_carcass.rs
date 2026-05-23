use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to hang");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("hang carcass");
    ctx.event("chore", "hung a carcass");
    0.03
}
