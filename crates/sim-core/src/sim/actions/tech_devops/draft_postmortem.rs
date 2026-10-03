use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("incident", 1) {
        ctx.add_literacy(0.003);
        return 0.03;
    }
    let n = ctx.literacy_kin(0.005);
    ctx.add_literacy(0.008);
    ctx.think("draft postmortem");
    ctx.event("life", "wrote a postmortem");
    0.08 + n as f32 * 0.01
}
