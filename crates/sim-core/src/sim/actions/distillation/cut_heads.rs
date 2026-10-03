use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 {
        ctx.think("nothing to cut");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("cut heads");
    ctx.event("chore", "discarded the foreshots");
    0.04
}
