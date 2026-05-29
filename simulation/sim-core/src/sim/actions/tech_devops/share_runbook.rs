use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.literacy_kin(0.004);
    ctx.add_literacy(0.005);
    ctx.think("share a runbook");
    ctx.event("chore", "share a runbook");
    0.05 + n as f32 * 0.005
}
