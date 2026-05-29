use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("article") == 0 {
        ctx.think("nothing to revise");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("incorporate edit");
    ctx.event("chore", "incorporated the editor's notes");
    0.03
}
