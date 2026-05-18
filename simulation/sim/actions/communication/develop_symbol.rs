//! Action 417: develop a symbol language.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("drawing symbols that carry meaning");
    ctx.discover("symbolic_language", "developed a system of symbols for communication");
    ctx.event("culture", "invented symbolic language, enriching how the group communicates");
    0.015
}
