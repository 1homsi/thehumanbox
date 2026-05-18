
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("singing the tribe's song");
    ctx.discover("anthem", "composed a tribal anthem");
    0.003
}
