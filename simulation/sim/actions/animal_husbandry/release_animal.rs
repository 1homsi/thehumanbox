
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("setting it free");
    ctx.event("social", "released an animal back into the wild");
    0.004
}
