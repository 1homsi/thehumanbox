//! Action 458: convert a stranger to the faith.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_idx = ctx.near.iter()
        .find(|&&i| ctx.sim.organisms[i].lineage_id != ctx.lid)
        .copied();
    let Some(si) = stranger_idx else { return 0.0; };
    let stranger_lid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.org_mut().update_attitude(&stranger_lid, 0.08);
    ctx.event("social", &format!("persuading a stranger from {} to follow the faith", stranger_lid));
    0.012
}
