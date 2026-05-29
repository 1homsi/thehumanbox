use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("nothing to rest");
        return 0.005;
    }
    ctx.add_comfort(0.02);
    ctx.think("rest mash");
    ctx.event("chore", "rested the mash");
    0.03
}
