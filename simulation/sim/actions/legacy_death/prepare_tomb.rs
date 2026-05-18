
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near { return 0.0; }
    ctx.think("carving out a resting place in the rock");
    ctx.discover("tomb_preparation", "prepared a stone tomb for the departed");
    ctx.event("build", "a tomb is carved into the rock face");
    0.010
}
