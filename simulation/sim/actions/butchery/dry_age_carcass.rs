use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to dry-age");
        return 0.005;
    }
    if ctx.chance(0.2) { ctx.add_good("meat", 1); }
    ctx.add_literacy(0.004);
    ctx.think("dry age");
    ctx.event("chore", "dry-aged the meat");
    0.04
}
