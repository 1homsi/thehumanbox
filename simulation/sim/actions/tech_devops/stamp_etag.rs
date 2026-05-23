use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("stamp etag");
    ctx.event("chore", "stamp etag");
    0.03
}
