use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("name a blanket");
    ctx.event("chore", "name a blanket");
    0.03
}
