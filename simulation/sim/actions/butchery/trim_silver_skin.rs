use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("cuts") == 0 && ctx.good("meat") == 0 {
        ctx.think("nothing to trim");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("trim silver skin");
    ctx.event("chore", "trimmed silver skin");
    0.03
}
