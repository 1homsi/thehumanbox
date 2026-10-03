use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("wash") == 0 {
        ctx.think("nothing to top off");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("top off wash");
    ctx.event("chore", "topped off the wash");
    0.03
}
