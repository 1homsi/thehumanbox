use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    let stranger = ctx
        .near
        .iter()
        .copied()
        .find(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    let Some(si) = stranger else {
        return 0.0;
    };
    let slid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&slid, 0.12);
    ctx.think("forging a bond between our peoples through ceremony");
    ctx.discover(
        "alliance_rite",
        "performed a formal alliance ceremony with another group",
    );
    ctx.event("ritual", "an alliance ceremony seals a pact between two groups");
    0.015
}
