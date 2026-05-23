use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("sausage") == 0 {
        ctx.think("no sausages to tie");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("tie sausage");
    ctx.event("chore", "tied off sausage links");
    0.03
}
