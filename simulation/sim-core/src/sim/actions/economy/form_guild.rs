use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 {
        ctx.think("not enough kin to form a guild");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    }
    ctx.think("founding a guild");
    ctx.discover("guild", "formed a guild with kin");
    ctx.event("governance", "established a guild among the tribe");
    0.015
}
