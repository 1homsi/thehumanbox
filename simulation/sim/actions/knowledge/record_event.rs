use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("recording the day's events");
    ctx.discover("chronicle", "began a chronicle");
    0.002
}
