//! Action 309: mark territory near rock; discover "borders".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("needs natural landmarks to establish borders");
        return 0.0;
    }
    ctx.think("marking tribal borders");
    ctx.discover("borders", "established formal territorial borders using natural landmarks");
    ctx.event("governance", "demarcated tribal territory along rocky boundaries");
    0.012
}
