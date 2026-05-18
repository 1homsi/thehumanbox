//! Action 519: elder creates a curriculum with 2 kin; discover "curriculum"; emit "governance".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    if ctx.kin.len() < 2 { return 0.0; }
    ctx.think("designing a structured path of learning for the tribe");
    ctx.discover("curriculum", "designed the first formal curriculum for tribal education");
    ctx.event("governance", "an elder establishes a curriculum for structured learning");
    0.012
}
