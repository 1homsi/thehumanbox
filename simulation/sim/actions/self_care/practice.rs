//! Action 116: practice a craft.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.04).max(0.0);
    ctx.think("practising a craft");
    0.002
}
