//! Action 419: decode a hidden message.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("puzzling out the hidden meaning");
    ctx.discover("decoding", "successfully decoded a secret message");
    ctx.event("culture", "deciphered a coded message, revealing its hidden contents");
    0.010
}
