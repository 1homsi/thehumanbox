use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("lead", 1) {
        ctx.think("no lead to write up");
        return 0.005;
    }
    ctx.add_good("draft", 1);
    ctx.add_literacy(0.005);
    ctx.think("draft a kicker");
    ctx.event("chore", "draft a kicker");
    0.06
}
