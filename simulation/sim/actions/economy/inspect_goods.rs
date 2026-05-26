use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let has_stranger = ctx
        .near
        .iter()
        .copied()
        .any(|k| ctx.sim.organisms[k].lineage_id != lid);
    if !has_stranger {
        ctx.think("no stranger's goods to inspect");
        return 0.0;
    }
    ctx.think("inspecting goods carefully");
    ctx.discover("quality_control", "developed quality inspection of traded goods");
    0.005
}
