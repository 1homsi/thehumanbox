
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("encoding secrets");
    ctx.discover("secret_code", "invented a secret code to protect sensitive messages");
    ctx.event("culture", "created a secret code known only to trusted insiders");
    0.012
}
