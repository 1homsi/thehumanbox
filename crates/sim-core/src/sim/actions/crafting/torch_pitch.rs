use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("torch-pitch", 0.006);
    ctx.think("dipping a torch");
    r
}
