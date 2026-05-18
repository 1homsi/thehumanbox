
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let count = ctx.kin.len();
    let disc_count = ctx.org().discoveries.len();
    let msg = format!("sharing {} discoveries with {} kin", disc_count, count);
    ctx.event("culture", &msg);
    0.005 + 0.002 * count.min(4) as f32
}
