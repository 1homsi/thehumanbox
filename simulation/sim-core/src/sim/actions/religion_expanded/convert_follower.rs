use super::super::ctx::ActionCtx;
use super::{action_is_possible, recount_religion_adherents};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, 458, &ctx.near, ctx.tick) {
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
    let stranger_idx = ctx
        .near
        .iter()
        .find(|&&i| {
            let stranger = &ctx.sim.organisms[i];
            stranger.lineage_id != ctx.lid && stranger.religion_id.as_deref() != Some(religion_id.as_str())
        })
        .copied();
    let Some(si) = stranger_idx else {
        return 0.0;
    };
    let stranger_lid = ctx.sim.organisms[si].lineage_id.clone();
    let stranger_name = ctx.sim.organisms[si].name.clone();
    let stranger = &mut ctx.sim.organisms[si];
    stranger.religion_id = Some(religion_id);
    stranger.piety = stranger.piety.max(0.20);
    ctx.org_mut().update_attitude(&stranger_lid, 0.08);
    recount_religion_adherents(ctx.sim);
    ctx.event(
        "social",
        &format!("persuaded {stranger_name} of lineage {stranger_lid} to follow {religion_name}"),
    );
    0.012
}
