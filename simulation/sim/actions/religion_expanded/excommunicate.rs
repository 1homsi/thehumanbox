//! Action 459: excommunicate a kin member with low standing.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let target = ctx.kin.iter()
        .find(|&&ki| {
            let lid = &ctx.sim.organisms[ki].lineage_id;
            *ctx.sim.organisms[ctx.idx].org_trust.get(lid).unwrap_or(&0.5) < 0.35
        })
        .copied();
    let Some(ti) = target else { return 0.0; };
    let target_lid = ctx.sim.organisms[ti].lineage_id.clone();
    ctx.org_mut().update_attitude(&target_lid, -0.1);
    ctx.event("governance", &format!("excommunicating a member of {} from the faith", target_lid));
    0.008
}
