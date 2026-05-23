use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to split");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("split brisket");
    ctx.event("chore", "split the brisket");
    0.03
}
