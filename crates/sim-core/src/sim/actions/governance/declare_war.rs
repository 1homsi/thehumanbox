use super::super::ctx::ActionCtx;
use crate::sim::warfare::declare_hostilities;

// Keep a declaration below the raid threshold so the canonical warfare tick
// can act on it immediately rather than leaving two officially warring
// lineages mechanically neutral.
const WAR_ATTITUDE_PENALTY: f32 = 0.55;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no enemy lineage to declare war on");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    let invalidated = {
        let sim = &mut *ctx.sim;
        declare_hostilities(
            &mut sim.treaties,
            &mut sim.organisms,
            &lid,
            &their,
            ctx.tick,
            WAR_ATTITUDE_PENALTY,
        )
    };
    ctx.think("declaring war");
    let treaty_label = if invalidated == 1 { "treaty" } else { "treaties" };
    ctx.event(
        "warfare",
        &format!("declared war against lineage {their}, invalidating {invalidated} active {treaty_label}"),
    );
    0.01
}
