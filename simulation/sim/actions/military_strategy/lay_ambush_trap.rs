
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near { return 0.0; }
    ctx.event("warfare", "laying an ambush trap in rocky terrain");
    ctx.discover("ambush_tactics", "developed the art of ambush");
    0.012
}
