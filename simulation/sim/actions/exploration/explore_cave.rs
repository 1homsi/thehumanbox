//! Action 117: explore a cave.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("searching for caves");
        return 0.0;
    }
    ctx.think("exploring a cave");
    ctx.discover("caves", "explored a cave");
    0.006
}
