use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.006);
    if ctx.chance(0.3) { ctx.add_good("incident", 1); }
    ctx.think("triage pager");
    ctx.event("chore", "triaged a pager alert");
    0.05
}
