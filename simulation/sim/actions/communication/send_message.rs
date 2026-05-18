
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no one to send word to");
        return 0.0;
    }
    ctx.think("sending word");
    ctx.event("social", "sent a message to a kin member to share vital information");
    0.005
}
