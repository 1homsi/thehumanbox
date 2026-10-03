use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("celebrating triumph with the tribe");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.08).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.08).min(1.0);
    ctx.discover("victory_rite", "celebrated victory with a formal ceremony");
    ctx.event(
        "culture",
        "the tribe holds a victory ceremony after a great success",
    );
    0.012
}
