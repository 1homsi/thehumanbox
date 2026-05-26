use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.event("governance", "a religious schism is tearing the community apart");
    if let Some(&ki) = ctx.kin.first() {
        let target_lid = ctx.sim.organisms[ki].lineage_id.clone();
        ctx.org_mut().update_attitude(&target_lid, -0.08);
    }
    ctx.discover("schism", "witnessed a devastating religious schism");
    0.008
}
