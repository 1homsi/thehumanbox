use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no mash to pitch yeast into");
        return 0.005;
    }
    if ctx.chance(0.3) { ctx.add_good("mash", 1); }
    ctx.add_literacy(0.004);
    ctx.think("pitch yeast");
    ctx.event("chore", "pitched the yeast");
    0.05
}
