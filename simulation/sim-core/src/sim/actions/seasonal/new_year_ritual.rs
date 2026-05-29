use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let year_tick = ctx.tick % 12000;
    if year_tick >= 500 {
        return 0.0;
    }
    ctx.think("marking the start of a new year");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.08).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.08).min(1.0);
    ctx.discover("new_year", "performed the first new year ritual");
    ctx.event("ritual", "the tribe celebrates the beginning of a new year");
    0.015
}
