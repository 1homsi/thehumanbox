use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.005);
    ctx.think("hand back receipt");
    ctx.event("chore", "handed back a receipt");
    0.02 + n as f32 * 0.002
}
