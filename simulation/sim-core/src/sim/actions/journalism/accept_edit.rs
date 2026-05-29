use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("article") == 0 {
        ctx.think("no article in play");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("accept edit");
    ctx.event("chore", "accepted the editor's cut");
    0.03
}
