
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_idx = ctx.near.iter()
        .find(|&&i| ctx.sim.organisms[i].lineage_id != ctx.lid)
        .copied();
    let Some(si) = stranger_idx else { return 0.0; };
    if ctx.kin.is_empty() { return 0.0; }
    let stranger_lid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.org_mut().update_attitude(&stranger_lid, 0.12);
    ctx.event("ritual", &format!("sharing a sacred ceremony with strangers of lineage {}", stranger_lid));
    ctx.discover("interfaith", "hosted the first inter-faith ceremony");
    0.018
}
