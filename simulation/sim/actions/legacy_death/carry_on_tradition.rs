//! Action 491: carry on the traditions of the fallen; discover "tradition_continuity"; emit "culture".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("keeping alive what those before us taught");
    ctx.discover("tradition_continuity", "upheld the traditions of ancestors");
    ctx.event("culture", "the tribe continues the traditions of those who have passed");
    0.008
}
