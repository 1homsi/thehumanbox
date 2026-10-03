use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("draft", 1) {
        ctx.think("no draft to pitch");
        return 0.005;
    }
    ctx.add_good("article", 1);
    ctx.add_literacy(0.005);
    ctx.think("pitch editor");
    ctx.event("chore", "pitched a draft to the editor");
    0.07
}
