use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to split");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("split pelvis");
    ctx.event("chore", "split the pelvis");
    0.03
}
