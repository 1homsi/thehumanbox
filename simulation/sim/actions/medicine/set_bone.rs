//! Action 251: heal a kin with very low health; discover "bone_setting".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.25);
    let Some(ki) = pick else {
        ctx.think("no critically injured kin");
        return 0.0;
    };
    ctx.sim.organisms[ki].health = (ctx.sim.organisms[ki].health + 0.08).min(1.0);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    ctx.think("setting a broken bone");
    ctx.discover("bone_setting", "set a broken bone and saved a kin member");
    0.015
}
