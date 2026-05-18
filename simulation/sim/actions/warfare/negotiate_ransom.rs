//! Action 200: ransom a low-health hostage.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid && o.health < 0.4
    });
    let Some(ki) = pick else {
        ctx.think("no hostage to ransom");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.06);
    ctx.sim.organisms[ctx.idx].inv_food =
        ctx.sim.organisms[ctx.idx].inv_food.saturating_add(1);
    ctx.think("negotiating a ransom");
    ctx.discover("ransom", "negotiated a ransom");
    0.008
}
