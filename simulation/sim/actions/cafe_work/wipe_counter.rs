use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.01);
    ctx.think("wipe counter");
    ctx.event("chore", "wiped the counter");
    0.02
}
