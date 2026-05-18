//! Action 507: preserve knowledge using rock storage; discover "knowledge_preservation"; emit "build".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near { return 0.0; }
    ctx.think("carving what we know into stone so it will last");
    ctx.discover("knowledge_preservation", "inscribed knowledge into stone for permanence");
    ctx.event("build", "knowledge is etched into stone for future generations");
    0.010
}
