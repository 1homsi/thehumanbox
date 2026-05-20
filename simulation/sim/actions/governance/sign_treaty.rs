
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no one to sign a treaty with");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.15);
    ctx.think("signing a treaty");
    ctx.discover("treaty", "signed a formal peace treaty with a foreign lineage");
    ctx.event("governance", "concluded a binding treaty with a neighboring tribe");
    0.040
}
