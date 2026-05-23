use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("meat", 1) {
        ctx.think("nothing to brine");
        return 0.005;
    }
    ctx.add_good("preserved", 1);
    ctx.think("brine the ham");
    ctx.event("chore", "brined the ham");
    0.06
}
