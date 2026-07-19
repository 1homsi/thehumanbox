use super::super::ctx::ActionCtx;
use super::{action_is_possible, recount_religion_adherents};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, 459, &ctx.near, ctx.tick) {
        return 0.0;
    }
    let Some(religion_id) = ctx.org().religion_id.clone() else {
        return 0.0;
    };
    let Some(religion_name) = ctx
        .sim
        .religions
        .iter()
        .find(|religion| religion.id == religion_id)
        .map(|religion| religion.name.clone())
    else {
        return 0.0;
    };
    let target = ctx
        .kin
        .iter()
        .find(|&&ki| ctx.sim.organisms[ki].religion_id.as_deref() == Some(religion_id.as_str()))
        .copied();
    let Some(ti) = target else {
        return 0.0;
    };
    let target_name = ctx.sim.organisms[ti].name.clone();
    ctx.sim.organisms[ti].religion_id = None;
    ctx.sim.organisms[ti].piety = 0.0;
    recount_religion_adherents(ctx.sim);
    ctx.event(
        "governance",
        &format!("excommunicated {target_name} from {religion_name}"),
    );
    0.008
}
