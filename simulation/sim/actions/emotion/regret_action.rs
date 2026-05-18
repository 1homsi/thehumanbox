//! Action 393: regret an action. Reduces comfort; self-reflection clears boredom.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort - 0.03).max(0.0);
    o.boredom = (o.boredom - 0.05).max(0.0);
    ctx.think("wishing things had gone differently");
    ctx.event("emotion", "felt deep regret and reflected on past choices");
    0.004
}
